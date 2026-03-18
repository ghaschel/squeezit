import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { resolveCompressOptions, resolveInputs } from "./utils";
import { logOptimizationResult, printSummary } from "./utils/console";
import { collectRequiredDependencies } from "./utils/dependencies";
import {
  applyReplacement,
  describeSkipReason,
  hasApngAnimation,
  parseIcoEntries,
  shouldAcceptIcoExtraction,
} from "./utils/optimizer";

const createdDirectories: string[] = [];

afterEach(async () => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe("resolveCompressOptions", () => {
  test("defaults concurrency to two workers in max mode", () => {
    const parsed = resolveCompressOptions([], { max: true }, process.cwd());
    expect(parsed.max).toBe(true);
    expect(parsed.concurrency).toBe(2);
    expect(parsed.recursive).toBe(false);
  });

  test("keeps positional patterns", () => {
    const parsed = resolveCompressOptions(
      ["assets/**/*.png", "hero.jpg"],
      {},
      process.cwd()
    );
    expect(parsed.patterns).toEqual(["assets/**/*.png", "hero.jpg"]);
  });
});

describe("resolveInputs", () => {
  test("defaults to supported files in the current directory", async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, "tracked.png"), "x");
    await writeFile(join(root, "favicon.ico"), "x");
    await writeFile(join(root, "preview.jxl"), "x");
    await writeFile(join(root, "notes.txt"), "x");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "nested", "deep.jpg"), "x");
    await writeFile(join(root, "nested", "deep.apng"), "x");

    const matches = await resolveInputs(resolveCompressOptions([], {}, root));
    const displayPaths = matches.map((entry) => entry.displayPath);

    expect(displayPaths).toEqual(["favicon.ico", "preview.jxl", "tracked.png"]);
  });

  test("matches unexpanded glob patterns", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "images", "nested", "banner.webp"), "x");
    await writeFile(join(root, "images", "cover.jpg"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["images/**/*.webp"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual([
      "images/nested/banner.webp",
    ]);
  });

  test("keeps bare shell patterns scoped to the current directory", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "top.png"), "x");
    await writeFile(join(root, "images", "nested", "deep.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["*.png"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual(["top.png"]);
  });

  test("supports explicit file parameters", async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, "file.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["file.png"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual(["file.png"]);
  });

  test("supports explicit directories without recursion", async () => {
    const root = await createTempDirectory();
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "images", "top.png"), "x");
    await writeFile(join(root, "images", "nested", "deep.png"), "x");

    const matches = await resolveInputs(
      resolveCompressOptions(["images"], {}, root)
    );
    expect(matches.map((entry) => entry.displayPath)).toEqual([
      "images/top.png",
    ]);
  });
});

describe("optimizer helpers", () => {
  test("describes skipped files clearly", () => {
    expect(describeSkipReason(0, 100)).toBe("no size change");
    expect(describeSkipReason(-18, 100)).toBe("grew by 18B");
    expect(describeSkipReason(64, 100)).toBe("saved 64B below threshold 100B");
  });

  test("replaces the original file from a staged optimized file", async () => {
    const root = await createTempDirectory();
    const originalPath = join(root, "social-preview.svg");
    const sourcePath = join(root, "work", "optimized.svg");

    await mkdir(join(root, "work"), { recursive: true });
    await writeFile(originalPath, "before");
    await writeFile(sourcePath, "after");

    const originalStats = await stat(originalPath);

    await applyReplacement({
      sourcePath,
      originalPath,
      targetPath: originalPath,
      keepTime: false,
      originalAtime: originalStats.atime,
      originalMtime: originalStats.mtime,
    });

    expect(await readFile(originalPath, "utf8")).toBe("after");
    await expect(stat(sourcePath)).rejects.toThrow();
  });

  test("detects APNG animation chunks", () => {
    const pngWithAnimation = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", Buffer.alloc(13)),
      chunk("acTL", Buffer.from([0x00, 0x00, 0x00, 0x02])),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const plainPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", Buffer.alloc(13)),
      chunk("IEND", Buffer.alloc(0)),
    ]);

    expect(hasApngAnimation(pngWithAnimation)).toBe(true);
    expect(hasApngAnimation(plainPng)).toBe(false);
  });

  test("parses ICO entry listings", () => {
    const entries = parseIcoEntries(
      [
        "--icon --index=1 --width=16 --height=16 --bit-depth=32 --palette-size=0",
        "--icon --index=2 --width=32 --height=32 --bit-depth=32 --palette-size=0",
      ].join("\n")
    );

    expect(entries).toEqual([
      { index: 1, width: 16, height: 16, bitDepth: 32 },
      { index: 2, width: 32, height: 32, bitDepth: 32 },
    ]);
  });

  test("accepts ICO extraction warnings when output exists", () => {
    expect(
      shouldAcceptIcoExtraction(
        "computer.ico: incorrect total size of bitmap (44184 specified; 16936 real)"
      )
    ).toBe(true);
    expect(
      shouldAcceptIcoExtraction(
        "computer.ico: no png image extracted from ico entry"
      )
    ).toBe(false);
  });
});

describe("dependency planning", () => {
  test("selects format-specific tools for new formats", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: join(process.cwd(), "image.png"),
          displayPath: "image.png",
        },
        {
          absolutePath: join(process.cwd(), "animation.apng"),
          displayPath: "animation.apng",
        },
        {
          absolutePath: join(process.cwd(), "favicon.ico"),
          displayPath: "favicon.ico",
        },
        {
          absolutePath: join(process.cwd(), "hero.jxl"),
          displayPath: "hero.jxl",
        },
      ],
      options
    );

    const binaries = dependencies.map((dependency) => dependency.binary).sort();

    expect(binaries).toContain("file");
    expect(binaries).toContain("pngcrush");
    expect(binaries).toContain("optipng");
    expect(binaries).toContain("zopflipng");
    expect(binaries).toContain("oxipng");
    expect(binaries).toContain("icotool");
    expect(binaries).toContain("cjxl");
    expect(binaries).toContain("exiftool");
  });
});

describe("console output", () => {
  test("prints skipped reasons", () => {
    const messages: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      messages.push(args.join(" "));
    };

    try {
      logOptimizationResult({
        filePath: join(process.cwd(), "assets", "squeezit-wordmark.svg"),
        label: "[SVG]",
        status: "skipped",
        originalSize: 446,
        optimizedSize: 446,
        savedBytes: 0,
        message: "no size change",
      });
    } finally {
      console.log = originalLog;
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("squeezit-wordmark.svg");
    expect(messages[0]).toContain("no size change");
  });

  test("prints a sectorized dry-run summary", () => {
    const messages: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      messages.push(args.join(" "));
    };

    try {
      printSummary(
        {
          processed: 4,
          optimized: 1,
          dryRunEligible: 3,
          failed: 0,
          skipped: 3,
          savedBytes: 113,
          startedAt: Date.now(),
        },
        { dryRun: true }
      );
    } finally {
      console.log = originalLog;
    }

    expect(messages).toHaveLength(8);
    expect(messages[1]).toContain("[DRY RUN]");
    expect(messages[2]).toContain("- Processed:");
    expect(messages[3]).toContain("- Optimized:");
    expect(messages[4]).toContain("- Skipped:");
    expect(messages[5]).toContain("- Failed:");
    expect(messages[7]).toContain("Saved");
    expect(messages[7]).toContain("113B");
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-test-"));
  createdDirectories.push(directory);
  return directory;
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}
