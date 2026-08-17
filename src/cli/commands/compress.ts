import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";

import type {
  CompressCommandOptions,
  OptimizationResult,
  ResolvedInput,
} from "../../types";
import {
  confirmImageOptimization,
  ensureDependencies,
  findUnsupportedExplicitInputs,
  formatOptimizationResult,
  logOptimizationResult,
  type OptimizationInputGuard,
  optimizeImages,
  printSummary,
  resolveCompressOptions,
  resolveInputs,
  runInteractiveOptimizations,
  shouldUseInteractiveProgress,
} from "../../utils";
import { SqueezitCommand } from "../base-command";
import type { CommandProgressReporter } from "../events";
import { requiresExplicitConfirmation, SqueezitError } from "../output";

export default class Compress extends SqueezitCommand {
  static override args = {
    patterns: Args.string({
      description: "Files, directories, or glob patterns to optimize.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Compress image files with safe lossless optimization.";

  static override flags = {
    recursive: Flags.boolean({
      char: "r",
      description: "Recurse into directories.",
    }),
    profile: Flags.option({
      description: "Optimization profile.",
      default: "standard",
      options: ["standard", "max"] as const,
    })(),
    "strip-meta": Flags.boolean({
      description: "Remove EXIF/IPTC/XMP metadata.",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description: "Report savings without modifying files.",
    }),
    "keep-time": Flags.boolean({
      char: "k",
      description: "Preserve original atime/mtime.",
    }),
    concurrency: Flags.integer({
      char: "c",
      min: 1,
      description: "Concurrent workers.",
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
      description: "Confirm image changes without a prompt.",
    }),
    threshold: Flags.integer({
      min: 0,
      description: "Minimum bytes saved before replacement.",
    }),
    "in-place": Flags.boolean({
      description: "Create temporary artifacts next to source files.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(Compress);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        concurrency: flags.concurrency,
        dryRun: flags["dry-run"],
        inPlace: flags["in-place"],
        keepTime: flags["keep-time"],
        profile: flags.profile,
        progress: flags.progress,
        recursive: flags.recursive,
        stripMeta: flags["strip-meta"],
        threshold: flags.threshold,
        verbose: flags.verbose,
      },
      process.cwd()
    );
    const report = await optimizeCommand(
      options,
      "compress",
      this.machineOutputEnabled(),
      {
        assumeYes: flags.yes,
        confirm: (inputCount) =>
          confirmImageOptimization("compress", inputCount),
      },
      this.eventReporter()
    );

    if (this.jsonEnabled()) {
      return this.emitStatus("compress", report.summary.failed === 0, report);
    }

    return report;
  }
}

export async function optimizeCommand(
  options: CompressCommandOptions,
  command: string,
  machineOutput: boolean,
  confirmation: {
    assumeYes?: boolean;
    confirm: (inputCount: number) => Promise<boolean>;
  },
  events?: CommandProgressReporter
): Promise<OptimizationCommandReport> {
  const discoverySpinner = machineOutput
    ? null
    : ora("Resolving image inputs").start();
  events?.phaseStarted("input-discovery");
  const [inputs, unsupportedInputs] = await Promise.all([
    resolveInputs(options),
    findUnsupportedExplicitInputs(options),
  ]);

  if (unsupportedInputs.length > 0) {
    discoverySpinner?.fail("Unsupported image input");
    throw new SqueezitError({
      code: "UNSUPPORTED_FORMAT",
      details: { paths: unsupportedInputs },
      message: `Unsupported image format: ${unsupportedInputs.join(", ")}`,
      remediation: "Use a supported image format or remove this input.",
    });
  }

  events?.phaseCompleted("input-discovery", { inputs: inputs.length });

  if (inputs.length === 0) {
    discoverySpinner?.warn("No matching image files found.");
  } else {
    discoverySpinner?.succeed(
      `Found ${chalk.bold(inputs.length.toString())} candidate files`
    );
  }

  return optimizeResolvedInputs(
    inputs,
    options,
    command,
    machineOutput,
    confirmation,
    undefined,
    events
  );
}

export interface OptimizationCommandReport {
  diagnostics?: string[];
  inputs: number;
  results: OptimizationResult[];
  summary: Awaited<ReturnType<typeof optimizeImages>>;
}

export async function optimizeResolvedInputs(
  inputs: ResolvedInput[],
  options: CompressCommandOptions,
  command: string,
  machineOutput: boolean,
  confirmation: {
    assumeYes?: boolean;
    confirm: (inputCount: number) => Promise<boolean>;
  },
  inputGuard?: OptimizationInputGuard,
  events?: CommandProgressReporter
): Promise<{
  diagnostics?: string[];
  inputs: number;
  results: OptimizationResult[];
  summary: Awaited<ReturnType<typeof optimizeImages>>;
}> {
  const diagnostics: string[] = [];
  const note = (message: string) => {
    diagnostics.push(message);
    if (options.verbose && !machineOutput) {
      process.stderr.write(`${message}\n`);
    }
  };
  if (inputs.length === 0) {
    note("No image inputs resolved.");
    return {
      inputs: 0,
      results: [],
      summary: emptySummary(),
      ...(options.verbose ? { diagnostics } : {}),
    };
  }

  if (!options.dryRun) {
    events?.phaseStarted("confirmation", { command });
    if (
      !confirmation.assumeYes &&
      requiresExplicitConfirmation({
        machineOutput,
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        details: { command },
        message: `--yes is required for ${command} in JSON, JSON Lines, or non-interactive mode.`,
        remediation:
          "Re-run with --yes after reviewing the files that will change.",
      });
    }
    if (
      !confirmation.assumeYes &&
      !(await confirmation.confirm(inputs.length))
    ) {
      throw new SqueezitError({
        code: "OPERATION_CANCELLED",
        details: { command },
        message: `${command} cancelled.`,
        remediation:
          "Re-run the command and confirm the operation when prompted.",
      });
    }
    events?.phaseCompleted("confirmation", { approved: true });
  }
  note(`Resolved ${inputs.length} input file(s).`);
  events?.phaseStarted("dependency-validation");
  await ensureDependencies({ ...options, installDeps: false }, inputs, {
    silent: machineOutput,
  });
  events?.phaseCompleted("dependency-validation");

  if (!machineOutput) {
    console.log("");
    console.log(
      chalk.dim(
        `${options.dryRun ? "Dry run" : "Processing"} ${inputs.length} file${inputs.length === 1 ? "" : "s"} with concurrency ${options.concurrency}`
      )
    );
    console.log("");
  }

  const interactive = !machineOutput && shouldUseInteractiveProgress(options);
  note(`Progress renderer: ${interactive ? "TTY interactive" : "streaming"}.`);
  events?.phaseStarted("optimization");
  const { results, summary } = interactive
    ? await runInteractiveOptimizations(
        inputs,
        options,
        inputGuard,
        lifecycleReporter(events)
      )
    : await runStreaming(inputs, options, machineOutput, inputGuard, events);
  events?.phaseCompleted("optimization", { processed: summary.processed });

  if (!machineOutput) {
    if (interactive) {
      for (const result of results) {
        console.log(formatOptimizationResult(result));
      }
    }
    printSummary(summary, { dryRun: options.dryRun });
  }

  process.exitCode = summary.failed > 0 ? 1 : 0;
  return {
    inputs: inputs.length,
    results,
    summary,
    ...(options.verbose ? { diagnostics } : {}),
  };
}

async function runStreaming(
  inputs: ResolvedInput[],
  options: CompressCommandOptions,
  machineOutput: boolean,
  inputGuard?: OptimizationInputGuard,
  events?: CommandProgressReporter
): Promise<{
  results: OptimizationResult[];
  summary: Awaited<ReturnType<typeof optimizeImages>>;
}> {
  const results: OptimizationResult[] = [];
  const summary = await optimizeImages(
    inputs,
    options,
    (result) => {
      results.push(result);
      if (!machineOutput) {
        logOptimizationResult(result);
      }
    },
    inputGuard,
    lifecycleReporter(events)
  );

  return { results, summary };
}

function lifecycleReporter(events?: CommandProgressReporter) {
  return events
    ? {
        onInputCompleted: (
          input: ResolvedInput,
          index: number,
          result: OptimizationResult
        ) =>
          events.inputCompleted(index, input.absolutePath, {
            result,
          }),
        onInputStarted: (input: ResolvedInput, index: number) =>
          events.inputStarted(index, input.absolutePath),
      }
    : undefined;
}

function emptySummary(): Awaited<ReturnType<typeof optimizeImages>> {
  return {
    processed: 0,
    optimized: 0,
    dryRunEligible: 0,
    failed: 0,
    skipped: 0,
    savedBytes: 0,
    startedAt: Date.now(),
  };
}
