import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";

import type { CompressCommandOptions, OptimizationResult } from "../../types";
import {
  confirmImageOptimization,
  ensureDependencies,
  formatOptimizationResult,
  logOptimizationResult,
  optimizeImages,
  printSummary,
  resolveCompressOptions,
  resolveInputs,
  runInteractiveOptimizations,
  shouldUseInteractiveProgress,
} from "../../utils";
import { SqueezitCommand } from "../base-command";
import { requiresExplicitConfirmation } from "../output";

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
      this.jsonEnabled(),
      {
        assumeYes: flags.yes,
        confirm: (inputCount) =>
          confirmImageOptimization("compress", inputCount),
      }
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
  json: boolean,
  confirmation: {
    assumeYes?: boolean;
    confirm: (inputCount: number) => Promise<boolean>;
  }
): Promise<{
  inputs: number;
  results: OptimizationResult[];
  summary: Awaited<ReturnType<typeof optimizeImages>>;
  diagnostics?: string[];
}> {
  const diagnostics: string[] = [];
  const note = (message: string) => {
    diagnostics.push(message);
    if (options.verbose && !json) {
      process.stderr.write(`${message}\n`);
    }
  };
  const discoverySpinner = json ? null : ora("Resolving image inputs").start();
  const inputs = await resolveInputs(options);

  if (inputs.length === 0) {
    discoverySpinner?.warn("No matching image files found.");
    note("No image inputs resolved.");
    return {
      inputs: 0,
      results: [],
      summary: emptySummary(),
      ...(options.verbose ? { diagnostics } : {}),
    };
  }

  discoverySpinner?.succeed(
    `Found ${chalk.bold(inputs.length.toString())} candidate files`
  );
  if (!options.dryRun) {
    if (
      !confirmation.assumeYes &&
      requiresExplicitConfirmation({
        json,
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      throw new Error(
        `--yes is required for ${command} in JSON or non-interactive mode.`
      );
    }
    if (
      !confirmation.assumeYes &&
      !(await confirmation.confirm(inputs.length))
    ) {
      throw new Error(`${command} cancelled.`);
    }
  }
  note(`Resolved ${inputs.length} input file(s).`);
  await ensureDependencies({ ...options, installDeps: false }, inputs, {
    silent: json,
  });

  if (!json) {
    console.log("");
    console.log(
      chalk.dim(
        `${options.dryRun ? "Dry run" : "Processing"} ${inputs.length} file${inputs.length === 1 ? "" : "s"} with concurrency ${options.concurrency}`
      )
    );
    console.log("");
  }

  const interactive = shouldUseInteractiveProgress(options);
  note(`Progress renderer: ${interactive ? "TTY interactive" : "streaming"}.`);
  const { results, summary } = interactive
    ? await runInteractiveOptimizations(inputs, options)
    : await runStreaming(inputs, options, json);

  if (!json) {
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
  inputs: Awaited<ReturnType<typeof resolveInputs>>,
  options: CompressCommandOptions,
  json: boolean
): Promise<{
  results: OptimizationResult[];
  summary: Awaited<ReturnType<typeof optimizeImages>>;
}> {
  const results: OptimizationResult[] = [];
  const summary = await optimizeImages(inputs, options, (result) => {
    results.push(result);
    if (!json) {
      logOptimizationResult(result);
    }
  });

  return { results, summary };
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
