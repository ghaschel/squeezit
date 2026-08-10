import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const resolveCompressOptions = vi.fn();
  const resolveInputs = vi.fn();
  const ensureDependencies = vi.fn();
  const optimizeImages = vi.fn();
  const runInteractiveOptimizations = vi.fn();
  const shouldUseInteractiveProgress = vi.fn();
  const printSummary = vi.fn();
  const logOptimizationResult = vi.fn();
  const formatOptimizationResult = vi.fn();
  const handleUpdateFlags = vi.fn();
  const spinner = {
    start: vi.fn(),
    warn: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    stop: vi.fn(),
  };
  spinner.start.mockReturnValue(spinner);
  const oraFactory = vi.fn(() => spinner);

  return {
    ensureDependencies,
    handleUpdateFlags,
    logOptimizationResult,
    optimizeImages,
    oraFactory,
    formatOptimizationResult,
    printSummary,
    resolveCompressOptions,
    resolveInputs,
    runInteractiveOptimizations,
    shouldUseInteractiveProgress,
    spinner,
  };
});

vi.mock("../../src/utils", () => ({
  ensureDependencies: hoisted.ensureDependencies,
  formatOptimizationResult: hoisted.formatOptimizationResult,
  logOptimizationResult: hoisted.logOptimizationResult,
  optimizeImages: hoisted.optimizeImages,
  printSummary: hoisted.printSummary,
  resolveCompressOptions: hoisted.resolveCompressOptions,
  resolveInputs: hoisted.resolveInputs,
  runInteractiveOptimizations: hoisted.runInteractiveOptimizations,
  shouldUseInteractiveProgress: hoisted.shouldUseInteractiveProgress,
}));

vi.mock("../../src/commands/update", () => ({
  handleUpdateFlags: hoisted.handleUpdateFlags,
}));

vi.mock("ora", () => ({
  default: hoisted.oraFactory,
}));

import { createCli } from "../../src/cli";

describe("cli parameters", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.handleUpdateFlags.mockResolvedValue(false);
    hoisted.resolveCompressOptions.mockImplementation(
      (patterns, flags, cwd) => ({
        patterns,
        recursive: flags.recursive ?? false,
        max: flags.max ?? false,
        stripMeta: flags.stripMeta ?? false,
        exifOnly: flags.exif ?? false,
        dryRun: flags.dryRun ?? false,
        keepTime: flags.keepTime ?? false,
        concurrency: flags.concurrency ?? 1,
        installDeps: flags.installDeps ?? false,
        verbose: flags.verbose ?? false,
        threshold: flags.threshold ?? 100,
        inPlace: flags.inPlace ?? false,
        progress: flags.progress ?? "auto",
        cwd,
      })
    );
    hoisted.resolveInputs.mockResolvedValue([]);
    hoisted.ensureDependencies.mockResolvedValue(undefined);
    hoisted.shouldUseInteractiveProgress.mockReturnValue(false);
    hoisted.runInteractiveOptimizations.mockResolvedValue({
      results: [],
      summary: emptySummary(),
    });
    hoisted.optimizeImages.mockResolvedValue({
      processed: 0,
      optimized: 0,
      dryRunEligible: 0,
      failed: 0,
      skipped: 0,
      savedBytes: 0,
      startedAt: Date.now(),
    });
    hoisted.printSummary.mockImplementation(() => undefined);
    hoisted.logOptimizationResult.mockImplementation(() => undefined);
    hoisted.formatOptimizationResult.mockImplementation(
      (result) => `formatted:${result.filePath}`
    );
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  test("registers the main command metadata", async () => {
    const program = await createCli();

    expect(program.name()).toBe("squeezit");
    expect(program.description()).toBe(
      "Compress images with maximum safe lossless optimization."
    );
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("forwards parsed compression flags and patterns to option resolution", async () => {
    const { error } = await parseCli([
      "--recursive",
      "--max",
      "--strip-meta",
      "--exif",
      "--dry-run",
      "--keep-time",
      "--concurrency",
      "3",
      "--install-deps",
      "--verbose",
      "--threshold",
      "42",
      "--in-place",
      "images",
      "*.png",
    ]);

    expect(error).toBeNull();
    expect(hoisted.handleUpdateFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        recursive: true,
        max: true,
        stripMeta: true,
        exif: true,
        dryRun: true,
        keepTime: true,
        concurrency: 3,
        installDeps: true,
        verbose: true,
        threshold: 42,
        inPlace: true,
      })
    );
    expect(hoisted.resolveCompressOptions).toHaveBeenCalledWith(
      ["images", "*.png"],
      expect.objectContaining({
        recursive: true,
        max: true,
        stripMeta: true,
        exif: true,
        dryRun: true,
        keepTime: true,
        concurrency: 3,
        installDeps: true,
        verbose: true,
        threshold: 42,
        inPlace: true,
      }),
      process.cwd()
    );
  });

  test("forwards an empty pattern list when no positional inputs are provided", async () => {
    const { error } = await parseCli([]);

    expect(error).toBeNull();
    expect(hoisted.resolveCompressOptions).toHaveBeenCalledWith(
      [],
      expect.any(Object),
      process.cwd()
    );
  });

  test("defaults progress to auto and accepts an explicit off mode", async () => {
    const defaultResult = await parseCli([]);
    const offResult = await parseCli(["--progress", "off"]);

    expect(defaultResult.error).toBeNull();
    expect(offResult.error).toBeNull();
    expect(hoisted.resolveCompressOptions).toHaveBeenNthCalledWith(
      1,
      [],
      expect.objectContaining({ progress: "auto" }),
      process.cwd()
    );
    expect(hoisted.resolveCompressOptions).toHaveBeenNthCalledWith(
      2,
      [],
      expect.objectContaining({ progress: "off" }),
      process.cwd()
    );
  });

  test("rejects unsupported progress modes", async () => {
    const { error } = await parseCli(["--progress", "always"]);

    expect(error).not.toBeNull();
    expect(error).toMatchObject({ code: "commander.invalidArgument" });
    expect(String(error)).toContain("Progress mode must be either auto or off");
  });

  test("holds TTY result lines until interactive work completes", async () => {
    const inputs = [
      { absolutePath: "/tmp/first.png", displayPath: "first.png" },
      { absolutePath: "/tmp/second.png", displayPath: "second.png" },
    ];
    const results = [
      {
        filePath: "/tmp/first.png",
        label: "[PNG]",
        status: "optimized" as const,
        originalSize: 1_000,
        optimizedSize: 800,
        savedBytes: 200,
      },
      {
        filePath: "/tmp/second.png",
        label: "[SKIP]",
        status: "skipped" as const,
        originalSize: 1_000,
        optimizedSize: 1_000,
        savedBytes: 0,
      },
    ];
    const summary = {
      ...emptySummary(),
      processed: 2,
      optimized: 1,
      skipped: 1,
      savedBytes: 200,
    };
    let completeInteractiveWork:
      | ((value: { results: typeof results; summary: typeof summary }) => void)
      | undefined;
    const interactiveWork = new Promise<{
      results: typeof results;
      summary: typeof summary;
    }>((resolve) => {
      completeInteractiveWork = resolve;
    });

    hoisted.resolveInputs.mockResolvedValue(inputs);
    hoisted.shouldUseInteractiveProgress.mockReturnValue(true);
    hoisted.runInteractiveOptimizations.mockReturnValue(interactiveWork);
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const parsing = parseCli(["images"]);
    await vi.waitFor(() => {
      expect(hoisted.runInteractiveOptimizations).toHaveBeenCalledWith(
        inputs,
        expect.objectContaining({ progress: "auto" })
      );
    });

    expect(hoisted.formatOptimizationResult).not.toHaveBeenCalled();
    expect(hoisted.logOptimizationResult).not.toHaveBeenCalled();

    completeInteractiveWork?.({ results, summary });
    const { error } = await parsing;

    expect(error).toBeNull();
    expect(hoisted.optimizeImages).not.toHaveBeenCalled();
    expect(hoisted.logOptimizationResult).not.toHaveBeenCalled();
    expect(hoisted.formatOptimizationResult).toHaveBeenNthCalledWith(
      1,
      results[0]
    );
    expect(hoisted.formatOptimizationResult).toHaveBeenNthCalledWith(
      2,
      results[1]
    );
    expect(consoleLog).toHaveBeenCalledWith("formatted:/tmp/first.png");
    expect(consoleLog).toHaveBeenCalledWith("formatted:/tmp/second.png");
    expect(hoisted.printSummary).toHaveBeenCalledWith(summary, {
      dryRun: false,
    });
  });

  test("keeps fallback results streaming as each file completes", async () => {
    const input = { absolutePath: "/tmp/first.png", displayPath: "first.png" };
    const result = {
      filePath: input.absolutePath,
      label: "[PNG]",
      status: "optimized" as const,
      originalSize: 1_000,
      optimizedSize: 800,
      savedBytes: 200,
    };
    const summary = {
      ...emptySummary(),
      processed: 1,
      optimized: 1,
      savedBytes: 200,
    };

    hoisted.resolveInputs.mockResolvedValue([input]);
    hoisted.optimizeImages.mockImplementation(
      async (_inputs, _options, onResult) => {
        onResult(result);
        return summary;
      }
    );

    const { error } = await parseCli(["images"]);

    expect(error).toBeNull();
    expect(hoisted.shouldUseInteractiveProgress).toHaveBeenCalled();
    expect(hoisted.runInteractiveOptimizations).not.toHaveBeenCalled();
    expect(hoisted.logOptimizationResult).toHaveBeenCalledWith(result);
    expect(hoisted.printSummary).toHaveBeenCalledWith(summary, {
      dryRun: false,
    });
  });

  test("uses the interactive lifecycle for dry runs", async () => {
    const input = { absolutePath: "/tmp/first.png", displayPath: "first.png" };
    const result = {
      filePath: input.absolutePath,
      label: "[PNG]",
      status: "dry-run" as const,
      originalSize: 1_000,
      optimizedSize: 800,
      savedBytes: 200,
    };
    const summary = {
      ...emptySummary(),
      processed: 1,
      dryRunEligible: 1,
      savedBytes: 200,
    };

    hoisted.resolveInputs.mockResolvedValue([input]);
    hoisted.shouldUseInteractiveProgress.mockReturnValue(true);
    hoisted.runInteractiveOptimizations.mockResolvedValue({
      results: [result],
      summary,
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parseCli(["--dry-run", "images"]);

    expect(error).toBeNull();
    expect(hoisted.runInteractiveOptimizations).toHaveBeenCalledWith(
      [input],
      expect.objectContaining({ dryRun: true })
    );
    expect(hoisted.logOptimizationResult).not.toHaveBeenCalled();
    expect(hoisted.printSummary).toHaveBeenCalledWith(summary, {
      dryRun: true,
    });
  });

  test("skips compression work when update mode is handled", async () => {
    hoisted.handleUpdateFlags.mockResolvedValue(true);

    const { error } = await parseCli(["--update", "--pm", "bun"]);

    expect(error).toBeNull();
    expect(hoisted.handleUpdateFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        update: true,
        pm: "bun",
      })
    );
    expect(hoisted.resolveCompressOptions).not.toHaveBeenCalled();
    expect(hoisted.resolveInputs).not.toHaveBeenCalled();
  });

  test("routes check-update flags through the update handler without compression work", async () => {
    hoisted.handleUpdateFlags.mockResolvedValue(true);

    const { error } = await parseCli(["--check-update", "--pm", "npm"]);

    expect(error).toBeNull();
    expect(hoisted.handleUpdateFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        checkUpdate: true,
        pm: "npm",
      })
    );
    expect(hoisted.resolveCompressOptions).not.toHaveBeenCalled();
    expect(hoisted.resolveInputs).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "abc"])(
    "rejects invalid concurrency value %s",
    async (value) => {
      const { error } = await parseCli(["--concurrency", value]);

      expect(error).not.toBeNull();
      expect(String(error)).toContain("positive integer");
    }
  );

  test.each(["-1", "abc"])(
    "rejects invalid threshold value %s",
    async (value) => {
      const { error } = await parseCli(["--threshold", value]);

      expect(error).not.toBeNull();
      expect(String(error)).toContain("non-negative integer");
    }
  );

  test("prints help output with the important options", async () => {
    const { error, stdout } = await parseCli(["--help"]);

    expect(error).not.toBeNull();
    expect(stdout).toContain("--recursive");
    expect(stdout).toContain("--max");
    expect(stdout).toContain("--strip-meta");
    expect(stdout).toContain("--exif");
    expect(stdout).toContain("--progress <mode>");
    expect(stdout).toContain("Progress display mode: auto or off");
    expect(stdout).not.toContain(
      "Progress display mode: auto or off (default: auto)"
    );
    expect(stdout).toContain("--check-update");
    expect(stdout).toContain("--pm <manager>");
  });

  test("prints the current package version", async () => {
    const program = await createCli();
    const expectedVersion = program.version();
    const { error, stdout } = await parseCli(["--version"]);

    expect(error).not.toBeNull();
    expect(stdout).toContain(expectedVersion);
  });

  test("fails clearly on unknown options", async () => {
    const { error, stderr } = await parseCli(["--definitely-not-a-real-flag"]);

    expect(error).not.toBeNull();
    expect(stderr).toContain("unknown option");
  });
});

async function parseCli(argv: string[]): Promise<{
  error: unknown;
  stderr: string;
  stdout: string;
}> {
  const program = await createCli();
  let stdout = "";
  let stderr = "";

  program.configureOutput({
    outputError: (message, write) => {
      write(message);
    },
    writeErr: (message) => {
      stderr += message;
    },
    writeOut: (message) => {
      stdout += message;
    },
  });
  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: "user" });
    return { error: null, stderr, stdout };
  } catch (error) {
    return { error, stderr, stdout };
  }
}

function emptySummary() {
  return {
    processed: 0,
    optimized: 0,
    dryRunEligible: 0,
    failed: 0,
    skipped: 0,
    savedBytes: 0,
    startedAt: 1_234,
  };
}
