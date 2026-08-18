import { Flags } from "@oclif/core";

import type { DependencyDiagnostic } from "../core/dependencies";
import type { ResolvedInput } from "../types";
import type { OptimizationLifecycle } from "../utils/optimizer";
import { SqueezitCommand } from "./base-command";
import type { PlanInputLifecycle } from "./optimization-plan";
import {
  type CommandEnvelope,
  type SqueezitIssue,
  toSqueezitIssue,
} from "./output";
import { type ReceiptSummary, RunReceiptRecorder } from "./run-receipt";

/**
 * Shared base for commands that may change the machine or create an auditable
 * result. Receipt creation deliberately happens after parsing but before the
 * command begins discovery, confirmation, or writes.
 */
export abstract class SqueezitOperationCommand extends SqueezitCommand {
  static override baseFlags = {
    ...SqueezitCommand.baseFlags,
    receipt: Flags.string({
      description:
        "Atomically checkpoint an auditable run receipt at this path.",
    }),
  };

  private recorder?: RunReceiptRecorder;

  override async catch(error: unknown): Promise<void> {
    if (this.recorder) {
      try {
        await this.recorder.fail(toSqueezitIssue(error));
      } catch {
        // A receipt checkpoint failure is already the command failure. Let the
        // inherited serializer preserve its stable machine-output contract.
      }
      if (!this.machineOutputEnabled()) {
        this.logToStderr(`Receipt: ${this.recorder.summary().path}`);
      }
    }

    await super.catch(error);
  }

  protected async beginReceipt(
    path: string | undefined,
    command: string,
    options: Record<string, unknown>,
    resumedFrom?: { path: string; receiptDigest: string; receiptId: string },
    operation?: string
  ): Promise<void> {
    if (!path) return;

    this.phaseStarted("receipt-preparation", { path });
    this.recorder = await RunReceiptRecorder.create({
      command,
      meta: this.commandMeta(),
      options,
      ...(operation ? { operation } : {}),
      path,
      ...(resumedFrom ? { resumedFrom } : {}),
      tools: [],
    });
    this.phaseCompleted("receipt-preparation", { path: this.recorder.path });
  }

  protected async completeReceipt<T extends object>(
    data: T,
    params: { error?: SqueezitIssue; exitCode?: number; ok: boolean }
  ): Promise<T & { receipt?: ReceiptSummary }> {
    if (!this.recorder) return data;

    const summary = await this.recorder.finalize({
      data: data as Record<string, unknown>,
      ...(params.error ? { error: params.error } : {}),
      exitCode: params.exitCode ?? (params.ok ? 0 : 1),
      ok: params.ok,
    });
    const output = { ...data, receipt: summary };
    if (!this.machineOutputEnabled()) {
      this.log(`Receipt: ${summary.path}`);
    }
    return output;
  }

  protected receiptLifecycle(): OptimizationLifecycle | undefined {
    if (!this.recorder) return undefined;

    return {
      onInputCompleted: async (input, index, result) => {
        await this.recorder?.inputCompleted(index, result);
      },
      onInputStarted: async (input, index) => {
        await this.recorder?.inputStarted(index);
      },
    };
  }

  protected receiptFingerprintLifecycle(): PlanInputLifecycle | undefined {
    if (!this.recorder) return undefined;

    return {
      onInputCompleted: async (_input, index) => {
        await this.recorder?.inputObserved(index);
      },
      onInputStarted: async (_input, index) => {
        await this.recorder?.inputStarted(index);
      },
    };
  }

  protected async receiptAddOutput(path: string): Promise<void> {
    await this.recorder?.addOutput(path);
  }

  protected async receiptPrepareInputs(inputs: ResolvedInput[]): Promise<void> {
    if (!this.recorder) return;
    this.phaseStarted("receipt-fingerprinting", { inputs: inputs.length });
    await this.recorder.prepareInputs(inputs);
    this.phaseCompleted("receipt-fingerprinting", { inputs: inputs.length });
  }

  protected async receiptObserveInputs(inputs: ResolvedInput[]): Promise<void> {
    if (!this.recorder) return;
    for (let index = 0; index < inputs.length; index += 1) {
      await this.recorder.inputStarted(index);
      await this.recorder.inputObserved(index);
    }
  }

  protected async receiptSetToolsAfter(
    tools: DependencyDiagnostic[]
  ): Promise<void> {
    await this.recorder?.setToolsAfter(tools);
  }

  protected async receiptSetOptions(
    options: Record<string, unknown>
  ): Promise<void> {
    await this.recorder?.setOptions(options);
  }

  protected async receiptSetToolsBefore(
    tools: DependencyDiagnostic[]
  ): Promise<void> {
    await this.recorder?.setToolsBefore(tools);
  }

  protected receiptSummary(): ReceiptSummary | undefined {
    return this.recorder?.summary();
  }

  protected override toErrorJson(error: unknown): unknown {
    const envelope = super.toErrorJson(error) as CommandEnvelope<
      Record<string, unknown>
    >;
    const receipt = this.receiptSummary();
    if (!receipt) return envelope;

    return {
      ...envelope,
      data: { ...envelope.data, receipt },
    } satisfies CommandEnvelope<Record<string, unknown>>;
  }
}
