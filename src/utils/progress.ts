import { Listr } from "listr2";

import type {
  CompressCommandOptions,
  CoreOptimizationOptions,
  OptimizationResult,
  ProgressMode,
  ResolvedInput,
  Summary,
} from "../types";
import {
  type OptimizationInputGuard,
  type OptimizationLifecycle,
  optimizeImage,
  summarizeOptimizationResults,
} from "./optimizer";

interface StdoutCapabilities {
  isTTY?: boolean;
}

interface TerminalEnvironment {
  [name: string]: string | undefined;
  CI?: string;
  TERM?: string;
}

export interface InteractiveOptimizationRun {
  results: OptimizationResult[];
  summary: Summary;
}

export function shouldUseInteractiveProgress(
  options: Pick<CompressCommandOptions, "progress">,
  stdout: StdoutCapabilities = process.stdout,
  environment: TerminalEnvironment = process.env
): boolean {
  return (
    options.progress === "auto" &&
    stdout.isTTY === true &&
    environment.TERM !== "dumb" &&
    environment.CI === undefined
  );
}

export async function runInteractiveOptimizations(
  inputs: ResolvedInput[],
  options: CoreOptimizationOptions,
  inputGuard?: OptimizationInputGuard,
  lifecycle?: OptimizationLifecycle
): Promise<InteractiveOptimizationRun> {
  const startedAt = Date.now();
  const resultSlots = new Array<OptimizationResult>(inputs.length);
  const taskList = new Listr(
    inputs.map((input, index) => ({
      title: input.displayPath,
      task: async (_context, task) => {
        await lifecycle?.onInputStarted?.(input, index);
        const result = await optimizeImage(input, options, inputGuard);
        resultSlots[index] = result;
        await lifecycle?.onInputCompleted?.(input, index, result);

        if (result.status === "skipped") {
          task.skip(result.message ?? "skipped");
          return;
        }

        if (result.status === "failed") {
          throw new Error(result.message ?? "optimization failed");
        }
      },
    })),
    {
      concurrent: options.concurrency,
      exitOnError: false,
      renderer: "default",
      rendererOptions: {
        clearOutput: true,
        formatOutput: "truncate",
      },
    }
  );

  await taskList.run();

  const results = resultSlots.map((result, index) => {
    if (!result) {
      throw new Error(
        `No optimization result was produced for ${inputs[index]?.displayPath ?? "input"}`
      );
    }

    return result;
  });

  return {
    results,
    summary: summarizeOptimizationResults(results, startedAt),
  };
}

export type { ProgressMode };
