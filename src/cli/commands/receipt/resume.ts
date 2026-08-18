import { resolve } from "node:path";

import { Args, Flags } from "@oclif/core";

import type { CompressCommandOptions, ResolvedInput } from "../../../types";
import {
  collectRequiredDependencies,
  diagnoseDependencies,
} from "../../../utils";
import type { OptimizationLifecycle } from "../../../utils/optimizer";
import { SqueezitCommand } from "../../base-command";
import type { CommandEnvelope } from "../../output";
import { SqueezitError } from "../../output";
import { preparePlanApply, runtimeSnapshot } from "../../plan-command";
import {
  fingerprintRunReceiptFile,
  fingerprintsMatch,
  readRunReceipt,
  type RunReceipt,
  type RunReceiptInput,
  RunReceiptRecorder,
} from "../../run-receipt";
import {
  type OptimizationCommandHooks,
  optimizeResolvedInputs,
  receiptOptions,
} from "../compress";

const RESUMABLE_OPERATIONS = new Set([
  "compress",
  "metadata strip",
  "plan apply",
]);

export default class ReceiptResume extends SqueezitCommand {
  static override args = {
    receipt: Args.string({
      description: "Path to an incomplete or failed Squeezit run receipt.",
      required: true,
    }),
  };

  static override description =
    "Resume eligible image work from a receipt into a new linked receipt.";

  static override flags = {
    output: Flags.string({
      description: "Path for the new linked run receipt.",
      required: true,
    }),
    progress: Flags.option({
      description: "Progress display mode.",
      default: "auto",
      options: ["auto", "off"] as const,
    })(),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Confirm retrying the receipt's pending or failed inputs.",
    }),
  };

  private recorder?: RunReceiptRecorder;

  override async catch(error: unknown): Promise<void> {
    if (this.recorder) {
      await this.recorder
        .fail(
          error instanceof SqueezitError
            ? error.toIssue()
            : {
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : String(error),
                remediation:
                  "Re-run the command. If the problem persists, report it with the command output.",
              }
        )
        .catch(() => undefined);
    }
    await super.catch(error);
  }

  protected override toErrorJson(error: unknown): unknown {
    const envelope = super.toErrorJson(error) as CommandEnvelope<
      Record<string, unknown>
    >;
    const receipt = this.recorder?.summary();
    if (!receipt) return envelope;

    return {
      ...envelope,
      data: { ...envelope.data, receipt },
    } satisfies CommandEnvelope<Record<string, unknown>>;
  }

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(ReceiptResume);
    if (!flags.yes) {
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        details: { command: "receipt resume" },
        message: "--yes is required to resume work from a receipt.",
        remediation:
          "Review the source receipt, then re-run with --yes to retry only eligible inputs.",
      });
    }

    this.phaseStarted("receipt-validation");
    const sourcePath = resolve(args.receipt);
    const source = await readRunReceipt(sourcePath);
    const retryable = selectRetryableInputs(source);
    const options = optionsFromReceipt(source, flags);
    assertResumeRuntime(source, this.config.version);
    await verifyReceiptInputs(retryable);
    this.phaseCompleted("receipt-validation", { inputs: retryable.length });

    this.phaseStarted("receipt-preparation", { path: flags.output });
    this.recorder = await RunReceiptRecorder.create({
      command: "receipt resume",
      meta: this.commandMeta(),
      operation: source.operation,
      options: receiptOptions(options),
      path: flags.output,
      resumedFrom: {
        path: sourcePath,
        receiptDigest: source.receiptDigest,
        receiptId: source.receiptId,
      },
      tools: source.tools.before,
    });
    this.phaseCompleted("receipt-preparation", { path: this.recorder.path });

    const selectedInputs = retryable.map(toResolvedInput);
    await this.recorder.prepareInputs(
      selectedInputs,
      retryable.map((input) => input.index)
    );

    const currentTools = await diagnoseDependencies(
      collectRequiredDependencies(selectedInputs, options)
    );
    assertResumeTools(source, currentTools);
    await this.recorder.setToolsBefore(currentTools);

    const prepared =
      source.operation === "plan apply"
        ? await prepareResumedPlanApply(source, retryable, flags)
        : undefined;
    const inputs = prepared?.inputs ?? selectedInputs;
    const inputGuard = prepared?.inputGuard;
    const report = await optimizeResolvedInputs(
      inputs,
      prepared?.options ?? options,
      "receipt resume",
      this.machineOutputEnabled(),
      { assumeYes: true, confirm: async () => true },
      inputGuard,
      this.eventReporter(),
      this.resumeHooks(retryable)
    );
    const ok = report.summary.failed === 0;
    const receipt = await this.recorder.finalize({
      data: { report, sourceReceipt: sourceSummary(sourcePath, source) },
      exitCode: ok ? 0 : 1,
      ok,
    });
    const data = {
      report,
      receipt,
      sourceReceipt: sourceSummary(sourcePath, source),
    };

    if (this.machineOutputEnabled()) {
      return this.emitStatus("receipt resume", ok, data);
    }
    this.log(`Receipt: ${receipt.path}`);
    return data;
  }

  private resumeHooks(retryable: RunReceiptInput[]): OptimizationCommandHooks {
    return {
      inputIndexes: retryable.map((input) => input.index),
      lifecycle: this.resumeLifecycle(),
      onToolsValidated: async (tools) => {
        // Dependencies are checked twice: once before creating the new receipt
        // and once by the shared runner immediately before optimizer work.
        await this.recorder?.setToolsBefore(tools);
      },
    };
  }

  private resumeLifecycle(): OptimizationLifecycle {
    return {
      onInputCompleted: async (_input, index, result) => {
        await this.recorder?.inputCompleted(index, result);
      },
      onInputStarted: async (_input, index) => {
        await this.recorder?.inputStarted(index);
      },
    };
  }
}

function assertResumeRuntime(source: RunReceipt, version: string): void {
  const currentPlatform = `${process.platform}-${process.arch}`;
  const differences = [
    source.meta.squeezitVersion === version
      ? undefined
      : {
          expected: source.meta.squeezitVersion,
          field: "squeezitVersion",
          actual: version,
        },
    source.meta.platform === currentPlatform
      ? undefined
      : {
          expected: source.meta.platform,
          field: "platform",
          actual: currentPlatform,
        },
  ].filter(
    (
      difference
    ): difference is { actual: string; expected: string; field: string } =>
      Boolean(difference)
  );

  if (differences.length > 0) {
    throw new SqueezitError({
      code: "RECEIPT_RUNTIME_CHANGED",
      details: { differences },
      message: "The current Squeezit runtime no longer matches this receipt.",
      remediation:
        "Create a new receipt in the current Squeezit runtime before applying image changes.",
    });
  }
}

function assertResumeTools(
  source: RunReceipt,
  current: Awaited<ReturnType<typeof diagnoseDependencies>>
): void {
  const expected = new Map(
    source.tools.before.map((tool) => [tool.binary, tool])
  );
  const differences = current.flatMap((tool) => {
    const recorded = expected.get(tool.binary);
    if (
      !recorded ||
      tool.status !== "healthy" ||
      recorded.status !== "healthy" ||
      recorded.provider !== tool.provider ||
      recorded.normalizedVersion !== tool.normalizedVersion
    ) {
      return [{ binary: tool.binary, current: tool, recorded }];
    }
    return [];
  });

  if (differences.length > 0) {
    throw new SqueezitError({
      code: "RECEIPT_TOOL_CHANGED",
      details: { differences },
      message: "The optimizer toolchain no longer matches this receipt.",
      remediation:
        "Restore the recorded healthy optimizer versions or create a new receipt.",
    });
  }
}

function optionsFromReceipt(
  receipt: RunReceipt,
  presentation: { progress: "auto" | "off"; verbose: boolean }
): CompressCommandOptions {
  if (!RESUMABLE_OPERATIONS.has(receipt.operation)) {
    throw new SqueezitError({
      code: "RECEIPT_NOT_RESUMABLE",
      details: { operation: receipt.operation },
      message: `Receipts for ${receipt.operation} cannot be resumed.`,
      remediation:
        "Resume only receipts created by compress, metadata strip, or plan apply.",
    });
  }

  const options = receipt.options;
  const concurrency = options.concurrency;
  const threshold = options.threshold;
  if (
    typeof concurrency !== "number" ||
    typeof threshold !== "number" ||
    typeof options.dryRun !== "boolean" ||
    typeof options.exifOnly !== "boolean" ||
    typeof options.inPlace !== "boolean" ||
    typeof options.keepTime !== "boolean" ||
    typeof options.max !== "boolean" ||
    typeof options.stripMeta !== "boolean"
  ) {
    throw new SqueezitError({
      code: "RECEIPT_INVALID",
      details: { receiptId: receipt.receiptId },
      message:
        "The receipt does not contain valid resolved optimization options.",
      remediation: "Create a new receipt with the current Squeezit CLI.",
    });
  }

  return {
    concurrency,
    cwd: receipt.meta.cwd,
    dryRun: options.dryRun,
    exifOnly: options.exifOnly,
    inPlace: options.inPlace,
    installDeps: false,
    keepTime: options.keepTime,
    max: options.max,
    patterns: [],
    progress: presentation.progress,
    recursive: false,
    stripMeta: options.stripMeta,
    threshold,
    verbose: presentation.verbose,
  };
}

async function prepareResumedPlanApply(
  source: RunReceipt,
  inputs: RunReceiptInput[],
  presentation: { progress: "auto" | "off"; verbose: boolean }
): Promise<Awaited<ReturnType<typeof preparePlanApply>>> {
  const planPath = source.options.plan;
  if (typeof planPath !== "string") {
    throw new SqueezitError({
      code: "RECEIPT_INVALID",
      details: { receiptId: source.receiptId },
      message: "The plan-apply receipt does not identify its source plan.",
      remediation: "Create and apply a new plan with the current Squeezit CLI.",
    });
  }

  const prepared = await preparePlanApply({
    inputPaths: inputs.map((input) => input.path),
    path: planPath,
    progress: presentation.progress,
    runtime: runtimeSnapshot({ squeezitVersion: source.meta.squeezitVersion }),
    verbose: presentation.verbose,
  });
  if (
    typeof source.options.planDigest !== "string" ||
    source.options.planDigest !== prepared.plan.planDigest
  ) {
    throw new SqueezitError({
      code: "RECEIPT_INVALID",
      details: { receiptId: source.receiptId },
      message:
        "The plan referenced by this receipt no longer matches its recorded digest.",
      remediation: "Create and apply a new plan with the current Squeezit CLI.",
    });
  }
  return prepared;
}

function selectRetryableInputs(source: RunReceipt): RunReceiptInput[] {
  if (!RESUMABLE_OPERATIONS.has(source.operation)) {
    throw new SqueezitError({
      code: "RECEIPT_NOT_RESUMABLE",
      details: { operation: source.operation },
      message: `Receipts for ${source.operation} cannot be resumed.`,
      remediation:
        "Resume only receipts created by compress, metadata strip, or plan apply.",
    });
  }
  const retryable = source.inputs.filter((input) =>
    ["failed", "pending", "running"].includes(input.state)
  );
  if (retryable.length === 0) {
    throw new SqueezitError({
      code: "RECEIPT_NOT_RESUMABLE",
      details: { receiptId: source.receiptId, status: source.status },
      message:
        "This receipt has no pending, interrupted, or failed inputs to resume.",
      remediation: "Create a new receipt for a new image operation.",
    });
  }
  return retryable;
}

async function verifyReceiptInputs(inputs: RunReceiptInput[]): Promise<void> {
  const mismatches = (
    await Promise.all(
      inputs.map(async (input) => {
        if (input.state === "failed") {
          if (
            !input.after ||
            !fingerprintsMatch(input.before, input.after.fingerprint)
          ) {
            return {
              path: input.path,
              reason: "failed input post-state is not safe to retry",
            };
          }
        }
        const current = await fingerprintRunReceiptFile(input.path).catch(
          () => undefined
        );
        if (!current || !fingerprintsMatch(input.before, current)) {
          return { path: input.path, reason: "input fingerprint changed" };
        }
        return undefined;
      })
    )
  ).filter((mismatch): mismatch is { path: string; reason: string } =>
    Boolean(mismatch)
  );

  if (mismatches.length > 0) {
    throw new SqueezitError({
      code: "RECEIPT_INPUT_CHANGED",
      details: { mismatches },
      message: "One or more receipt inputs changed before resume.",
      remediation:
        "Create and review a new receipt before optimizing the changed files.",
    });
  }
}

function sourceSummary(path: string, source: RunReceipt) {
  return {
    path,
    receiptDigest: source.receiptDigest,
    receiptId: source.receiptId,
  };
}

function toResolvedInput(input: RunReceiptInput): ResolvedInput {
  return { absolutePath: input.path, displayPath: input.displayPath };
}
