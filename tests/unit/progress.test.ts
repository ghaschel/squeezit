import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CoreOptimizationOptions,
  OptimizationResult,
  ResolvedInput,
} from "../../src/types";

const hoisted = vi.hoisted(() => {
  const optimizeImage = vi.fn();
  type MockTask = {
    task?: (
      context: unknown,
      wrapper: { skip: (message?: string) => void }
    ) => Promise<void> | void;
  };
  const instances: Array<{
    options: { concurrent?: boolean | number; rendererOptions?: unknown };
    outcomes: string[];
    tasks: MockTask[];
  }> = [];

  class Listr {
    readonly options: {
      concurrent?: boolean | number;
      rendererOptions?: unknown;
    };
    readonly outcomes: string[] = [];
    readonly tasks: MockTask[];

    constructor(
      tasks: MockTask[],
      options: { concurrent?: boolean | number; rendererOptions?: unknown }
    ) {
      this.tasks = tasks;
      this.options = options;
      instances.push(this);
    }

    async run(): Promise<void> {
      let nextTask = 0;
      const concurrency =
        typeof this.options.concurrent === "number"
          ? this.options.concurrent
          : 1;
      const workers = Array.from(
        { length: Math.min(concurrency, this.tasks.length) },
        async () => {
          while (nextTask < this.tasks.length) {
            const task = this.tasks[nextTask++];
            if (task) {
              let skipped = false;

              try {
                await task.task?.(undefined, {
                  skip: () => {
                    skipped = true;
                  },
                });
                this.outcomes.push(skipped ? "skipped" : "completed");
              } catch {
                this.outcomes.push("failed");
              }
            }
          }
        }
      );

      await Promise.all(workers);
    }
  }

  return { instances, Listr, optimizeImage };
});

vi.mock("listr2", () => ({ Listr: hoisted.Listr }));

vi.mock("../../src/utils/optimizer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/utils/optimizer")>();

  return { ...actual, optimizeImage: hoisted.optimizeImage };
});

import {
  runInteractiveOptimizations,
  shouldUseInteractiveProgress,
} from "../../src/utils/progress";

const options: CoreOptimizationOptions = {
  max: false,
  stripMeta: false,
  exifOnly: false,
  dryRun: false,
  keepTime: false,
  concurrency: 2,
  threshold: 100,
  inPlace: false,
};

const inputs: ResolvedInput[] = [
  { absolutePath: "/tmp/first.png", displayPath: "first.png" },
  { absolutePath: "/tmp/second.png", displayPath: "second.png" },
  { absolutePath: "/tmp/third.png", displayPath: "third.png" },
];

describe("interactive progress selection", () => {
  test.each([
    ["uses a supported TTY", { isTTY: true }, { TERM: "xterm-256color" }, true],
    [
      "rejects non-TTY output",
      { isTTY: false },
      { TERM: "xterm-256color" },
      false,
    ],
    [
      "rejects CI output",
      { isTTY: true },
      { TERM: "xterm-256color", CI: "1" },
      false,
    ],
    [
      "rejects an explicitly empty CI setting",
      { isTTY: true },
      { TERM: "xterm-256color", CI: "" },
      false,
    ],
    ["rejects dumb terminals", { isTTY: true }, { TERM: "dumb" }, false],
    [
      "honors an explicit off mode",
      { isTTY: true },
      { TERM: "xterm-256color" },
      false,
      "off",
    ],
  ])("%s", (_label, stdout, environment, expected, progress = "auto") => {
    expect(
      shouldUseInteractiveProgress(
        { progress: progress as "auto" | "off" },
        stdout,
        environment
      )
    ).toBe(expected);
  });
});

describe("interactive optimization runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.instances.length = 0;
  });

  test("uses bounded Listr tasks and returns retained results in discovery order", async () => {
    hoisted.optimizeImage.mockImplementation(async (input: ResolvedInput) => {
      await delay(input.displayPath === "first.png" ? 20 : 1);

      const status =
        input.displayPath === "first.png"
          ? "optimized"
          : input.displayPath === "second.png"
            ? "failed"
            : "skipped";
      return resultFor(input, status);
    });

    const { results, summary } = await runInteractiveOptimizations(
      inputs,
      options
    );

    expect(results.map((result) => result.filePath)).toEqual(
      inputs.map((input) => input.absolutePath)
    );
    expect(results.map((result) => result.status)).toEqual([
      "optimized",
      "failed",
      "skipped",
    ]);
    expect(summary).toMatchObject({
      processed: 3,
      optimized: 1,
      failed: 1,
      skipped: 1,
      savedBytes: 200,
    });
    expect(hoisted.instances).toHaveLength(1);
    expect(hoisted.instances[0]?.options).toMatchObject({
      concurrent: 2,
      exitOnError: false,
      renderer: "default",
      rendererOptions: {
        clearOutput: true,
        formatOutput: "truncate",
      },
    });
    expect(hoisted.instances[0]?.outcomes).toEqual(
      expect.arrayContaining(["completed", "failed", "skipped"])
    );
  });

  test("keeps dry-run results in the same retained flow", async () => {
    const dryRunOptions = { ...options, dryRun: true };
    hoisted.optimizeImage.mockImplementation(
      async (input: ResolvedInput, receivedOptions) => {
        expect(receivedOptions).toMatchObject({ dryRun: true });
        return resultFor(input, "dry-run");
      }
    );

    const { results, summary } = await runInteractiveOptimizations(
      inputs.slice(0, 1),
      dryRunOptions
    );

    expect(results.map((result) => result.status)).toEqual(["dry-run"]);
    expect(summary).toMatchObject({
      processed: 1,
      optimized: 0,
      dryRunEligible: 1,
      savedBytes: 200,
    });
  });

  test("passes an input guard to every concurrent optimization", async () => {
    const guard = { verify: vi.fn().mockResolvedValue(undefined) };
    hoisted.optimizeImage.mockImplementation(async (input: ResolvedInput) =>
      resultFor(input, "optimized")
    );

    await runInteractiveOptimizations(inputs.slice(0, 2), options, guard);

    expect(hoisted.optimizeImage).toHaveBeenCalledWith(
      inputs[0],
      options,
      guard
    );
    expect(hoisted.optimizeImage).toHaveBeenCalledWith(
      inputs[1],
      options,
      guard
    );
  });

  test("reports concurrent input lifecycle with stable discovery indexes", async () => {
    hoisted.optimizeImage.mockImplementation(async (input: ResolvedInput) => {
      await delay(input.displayPath === "first.png" ? 20 : 1);
      return resultFor(input, "optimized");
    });
    const events: string[] = [];

    await runInteractiveOptimizations(inputs, options, undefined, {
      onInputCompleted: (_input, index) => events.push(`completed:${index}`),
      onInputStarted: (_input, index) => events.push(`started:${index}`),
    });

    expect(events).toEqual([
      "started:0",
      "started:1",
      "completed:1",
      "started:2",
      "completed:2",
      "completed:0",
    ]);
  });
});

function resultFor(
  input: ResolvedInput,
  status: OptimizationResult["status"]
): OptimizationResult {
  return {
    filePath: input.absolutePath,
    label:
      status === "failed"
        ? "[FAIL]"
        : status === "skipped"
          ? "[SKIP]"
          : "[PNG]",
    status,
    originalSize: status === "failed" ? 0 : 1_000,
    optimizedSize: status === "failed" ? 0 : 800,
    savedBytes: status === "optimized" || status === "dry-run" ? 200 : 0,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
