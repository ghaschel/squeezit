import { describe, expect, test } from "vitest";

import { toReportedPath } from "../../src/api";
import {
  collectDependencyInstallTargets,
  createBufferAsset,
  createFileAsset,
  DEPENDENCY_CATALOG,
  installDependencies,
} from "../../src/core";
import { collectRequiredDependencies } from "../../src/utils/dependencies";
import {
  buildJxlArgs,
  buildRawDnglabArgs,
  buildZopfliPngArgs,
  canUseBmpRle,
  hasMatchingIcoDimensions,
  hasMatchingIconContainerEntries,
  isValidBmpRleRewrite,
  parseBmpHeader,
  parseIconContainerEntries,
  parseWebpInfo,
  summarizeOptimizationResults,
} from "../../src/utils/optimizer";
import { resolveCompressOptions } from "../../src/utils/options";

describe("core assets", () => {
  test("creates buffer assets for future wrapper support", () => {
    const asset = createBufferAsset("hero.png", Buffer.from("hello"));

    expect(asset.kind).toBe("buffer");
    expect(asset.fileName).toBe("hero.png");
    expect(asset.contents.toString("utf8")).toBe("hello");
  });

  test("creates file assets for filesystem-backed optimization", () => {
    const asset = createFileAsset("/tmp/example/image.png");

    expect(asset.kind).toBe("file");
    expect(asset.fileName).toBe("image.png");
    expect(asset.filePath).toBe("/tmp/example/image.png");
  });
});

describe("cli option resolution", () => {
  test("maps the max profile to the existing full optimization behavior", () => {
    const parsed = resolveCompressOptions(
      [],
      { profile: "max" } as never,
      process.cwd()
    );

    expect(parsed.max).toBe(true);
    expect(parsed.stripMeta).toBe(true);
    expect(parsed.threshold).toBe(0);
    expect(parsed.concurrency).toBe(2);
  });

  test("rejects a threshold override for the max profile", () => {
    expect(() =>
      resolveCompressOptions(
        [],
        { profile: "max", threshold: 1 } as never,
        process.cwd()
      )
    ).toThrow("--threshold cannot be used with --profile max");
  });

  test("forces threshold zero in max mode", () => {
    const parsed = resolveCompressOptions([], { max: true }, process.cwd());

    expect(parsed.max).toBe(true);
    expect(parsed.stripMeta).toBe(true);
    expect(parsed.exifOnly).toBe(false);
    expect(parsed.threshold).toBe(0);
    expect(parsed.concurrency).toBe(2);
  });

  test("treats exif mode as metadata-only", () => {
    const parsed = resolveCompressOptions([], { exif: true }, process.cwd());

    expect(parsed.max).toBe(false);
    expect(parsed.exifOnly).toBe(true);
    expect(parsed.stripMeta).toBe(true);
  });

  test("defaults progress to auto and preserves an explicit off mode", () => {
    expect(resolveCompressOptions([], {}, process.cwd()).progress).toBe("auto");
    expect(
      resolveCompressOptions([], { progress: "off" }, process.cwd()).progress
    ).toBe("off");
  });
});

describe("optimization result summaries", () => {
  test("summarizes every result status without depending on completion order", () => {
    const startedAt = 1_234;
    const summary = summarizeOptimizationResults(
      [
        {
          filePath: "/tmp/first.png",
          label: "[PNG]",
          status: "optimized",
          originalSize: 1_000,
          optimizedSize: 800,
          savedBytes: 200,
        },
        {
          filePath: "/tmp/second.png",
          label: "[PNG]",
          status: "dry-run",
          originalSize: 500,
          optimizedSize: 400,
          savedBytes: 100,
        },
        {
          filePath: "/tmp/third.png",
          label: "[SKIP]",
          status: "skipped",
          originalSize: 500,
          optimizedSize: 500,
          savedBytes: 0,
        },
        {
          filePath: "/tmp/fourth.png",
          label: "[FAIL]",
          status: "failed",
          originalSize: 0,
          optimizedSize: 0,
          savedBytes: 0,
        },
      ],
      startedAt
    );

    expect(summary).toEqual({
      processed: 4,
      optimized: 1,
      dryRunEligible: 1,
      failed: 1,
      skipped: 1,
      savedBytes: 300,
      startedAt,
    });
  });
});

describe("dependency planning", () => {
  test("uses APT and the pinned Cargo fallback for Debian PNG dependencies", () => {
    expect(
      collectDependencyInstallTargets(
        [
          DEPENDENCY_CATALOG.pngcrush,
          DEPENDENCY_CATALOG.optipng,
          DEPENDENCY_CATALOG.oxipng,
        ],
        "debian"
      )
    ).toEqual([
      { installer: "apt", package: "pngcrush" },
      { installer: "apt", package: "optipng" },
      { installer: "cargo", package: "oxipng", version: "10.1.0" },
    ]);
  });

  test("installs Debian packages before the pinned Cargo crate", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const targets = collectDependencyInstallTargets(
      [
        DEPENDENCY_CATALOG.pngcrush,
        DEPENDENCY_CATALOG.optipng,
        DEPENDENCY_CATALOG.oxipng,
      ],
      "debian"
    );

    await installDependencies("debian", targets, {
      commandExists: async (binary) => binary === "cargo",
      runCheckedCommand: async (command, args) => {
        commands.push({ command, args });
      },
    });

    expect(commands).toEqual([
      { command: "sudo", args: ["apt", "update"] },
      {
        command: "sudo",
        args: ["apt", "install", "-y", "pngcrush", "optipng"],
      },
      {
        command: "cargo",
        args: ["install", "oxipng", "--version", "10.1.0", "--locked"],
      },
    ]);
  });

  test("collects heavy dependencies for png max mode", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.png",
          displayPath: "sample.png",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining([
        "file",
        "pngcrush",
        "optipng",
        "oxipng",
        "zopflipng",
        "exiftool",
      ])
    );
  });

  test("uses only MozJPEG for standard JPEG optimization", () => {
    const options = resolveCompressOptions([], {}, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.jpg",
          displayPath: "sample.jpg",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual([
      "file",
      "jpegtran",
    ]);
  });

  test("adds JPEGoptim as an independent candidate only for max JPEG optimization", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.jpg",
          displayPath: "sample.jpg",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual([
      "file",
      "jpegtran",
      "jpegoptim",
    ]);
  });

  test("uses svgo instead of exiftool for svg exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.svg",
          displayPath: "sample.svg",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file", "svgo"]);
  });

  test("does not require exiftool for ico exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.ico",
          displayPath: "sample.ico",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file"]);
  });

  test("does not require exiftool for cur exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.cur",
          displayPath: "sample.cur",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file"]);
  });

  test("does not require exiftool for bmp exif-only mode", () => {
    const options = resolveCompressOptions([], { exif: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.bmp",
          displayPath: "sample.bmp",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(["file"]);
  });

  test("requires exiftool for gif metadata stripping", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.gif",
          displayPath: "sample.gif",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining(["file", "gifsicle", "exiftool"])
    );
  });

  test("does not require exiftool for bmp max mode", () => {
    const options = resolveCompressOptions([], { max: true }, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.bmp",
          displayPath: "sample.bmp",
        },
      ],
      options
    );

    expect(dependencies.map((entry) => entry.binary)).toEqual(
      expect.arrayContaining(["file", "magick"])
    );
    expect(dependencies.map((entry) => entry.binary)).not.toContain("exiftool");
  });

  test("requires webpmux instead of gif2webp for webp optimization", () => {
    const options = resolveCompressOptions([], {}, process.cwd());
    const dependencies = collectRequiredDependencies(
      [
        {
          absolutePath: "/tmp/sample.webp",
          displayPath: "sample.webp",
        },
      ],
      options
    );
    const binaries = dependencies.map((entry) => entry.binary);

    expect(binaries).toEqual(
      expect.arrayContaining([
        "file",
        "cwebp",
        "dwebp",
        "webpinfo",
        "webpmux",
        "magick",
      ])
    );
    expect(binaries).not.toContain("gif2webp");
  });
});

describe("webp info parsing", () => {
  test("treats Animation zero as static and records metadata chunks", () => {
    const info = parseWebpInfo(
      [
        "RIFF HEADER:",
        "Chunk VP8X at offset     12, length     18",
        "  ICCP: 0",
        "  Alpha: 0",
        "  EXIF: 0",
        "  XMP: 1",
        "  Animation: 0",
        "Chunk VP8  at offset     30, length 517830",
        "  Animation: 0",
        "  Format: Lossy (1)",
        "Chunk XMP  at offset 517860, length 1202874",
      ].join("\n")
    );

    expect(info).toEqual({
      animated: false,
      metadataChunks: ["xmp"],
    });
  });

  test("detects true animated webp output", () => {
    const info = parseWebpInfo(
      [
        "RIFF HEADER:",
        "Chunk VP8X at offset     12, length     18",
        "  Animation: 1",
        "Chunk ANIM at offset     30, length     14",
        "Chunk ANMF at offset     44, length     80",
        "Chunk VP8L at offset     68, length     24",
        "  Animation: 0",
        "  Format: Lossless (2)",
      ].join("\n")
    );

    expect(info).toEqual({
      animated: true,
      metadataChunks: [],
    });
  });
});

describe("api path reporting", () => {
  test("converts absolute paths to cwd-relative paths", () => {
    expect(
      toReportedPath("/repo/tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("preserves already-relative paths", () => {
    expect(
      toReportedPath("tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("uses the resolved input display path as a fallback", () => {
    expect(
      toReportedPath(undefined, "/repo", {
        absolutePath: "/repo/tests/fixtures/formats/png/sample.png",
        displayPath: "tests/fixtures/formats/png/sample.png",
      })
    ).toBe("tests/fixtures/formats/png/sample.png");
  });

  test("keeps output paths in the same cwd-relative coordinate system", () => {
    expect(
      toReportedPath("/repo/out/tests/fixtures/formats/png/sample.png", "/repo")
    ).toBe("out/tests/fixtures/formats/png/sample.png");
  });
});

describe("raw dng conversion", () => {
  test("uses smallest-lossless dnglab flags in max mode", () => {
    expect(
      buildRawDnglabArgs("/tmp/input/sample.cr2", "/tmp/output/sample.dng")
    ).toEqual([
      "convert",
      "--compression",
      "lossless",
      "--embed-raw",
      "false",
      "--dng-preview",
      "false",
      "--dng-thumbnail",
      "false",
      "/tmp/input/sample.cr2",
      "/tmp/output/sample.dng",
    ]);
  });

  test("adds rw2 predictor tuning when requested", () => {
    expect(
      buildRawDnglabArgs("/tmp/input/sample.rw2", "/tmp/output/sample.dng", 7)
    ).toEqual([
      "convert",
      "--compression",
      "lossless",
      "--embed-raw",
      "false",
      "--dng-preview",
      "false",
      "--dng-thumbnail",
      "false",
      "--ljpeg92-predictor",
      "7",
      "/tmp/input/sample.rw2",
      "/tmp/output/sample.dng",
    ]);
  });
});

describe("jxl optimization", () => {
  test("uses expert mode for max effort 11", () => {
    expect(
      buildJxlArgs("/tmp/input/sample.jxl", "/tmp/output/sample.jxl", 11)
    ).toEqual([
      "--distance=0",
      "--allow_expert_options",
      "--effort=11",
      "/tmp/input/sample.jxl",
      "/tmp/output/sample.jxl",
    ]);
  });

  test("jxl metadata writes allow bmff wrapping", async () => {
    const source = await import("node:fs/promises");
    const code = await source.readFile(
      "/Users/guilhermehaschel/Documents/Workspace/Personal/compress/src/utils/optimizer.ts",
      "utf8"
    );

    expect(code).toContain('args.push("-m")');
  });
});

describe("png max tuning", () => {
  test("uses 10 zopflipng iterations by default and 15 in max mode", () => {
    expect(
      buildZopfliPngArgs("/tmp/input.png", "/tmp/output.png", false)
    ).toEqual([
      "--iterations=10",
      "--filters=01234mepb",
      "/tmp/input.png",
      "/tmp/output.png",
    ]);

    expect(
      buildZopfliPngArgs("/tmp/input.png", "/tmp/output.png", true)
    ).toEqual([
      "--iterations=15",
      "--filters=01234mepb",
      "/tmp/input.png",
      "/tmp/output.png",
    ]);
  });
});

describe("bmp rle support", () => {
  test("parses a 4-bit bmp header", () => {
    const header = parseBmpHeader(createBmpHeaderBuffer(4, 0));

    expect(header).toEqual({
      dibHeaderSize: 40,
      bitsPerPixel: 4,
      compression: 0,
    });
  });

  test("parses an 8-bit bmp header", () => {
    const header = parseBmpHeader(createBmpHeaderBuffer(8, 1));

    expect(header).toEqual({
      dibHeaderSize: 40,
      bitsPerPixel: 8,
      compression: 1,
    });
  });

  test("rejects malformed or non-bmp input", () => {
    expect(parseBmpHeader(Buffer.from("not-a-bmp"))).toBeNull();
  });

  test("only 4-bit and 8-bit bmps are eligible for rle", () => {
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 4,
        compression: 0,
      })
    ).toBe(true);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 8,
        compression: 0,
      })
    ).toBe(true);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 24,
        compression: 0,
      })
    ).toBe(false);
    expect(
      canUseBmpRle({
        dibHeaderSize: 40,
        bitsPerPixel: 32,
        compression: 0,
      })
    ).toBe(false);
  });

  test("validates that bmp rewrites preserve bit depth and rle compression", () => {
    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 2 }
      )
    ).toBe(true);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 1 }
      )
    ).toBe(true);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 8, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 2 }
      )
    ).toBe(false);

    expect(
      isValidBmpRleRewrite(
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 },
        { dibHeaderSize: 40, bitsPerPixel: 4, compression: 0 }
      )
    ).toBe(false);
  });
});

describe("ico safety", () => {
  test("requires rebuilt icons to preserve entry dimensions", () => {
    expect(
      hasMatchingIcoDimensions(
        [
          { index: 1, width: 16, height: 16 },
          { index: 2, width: 32, height: 32 },
        ],
        [
          { index: 1, width: 16, height: 16 },
          { index: 2, width: 24, height: 24 },
        ]
      )
    ).toBe(false);
  });

  test("parses cursor hotspots from icon container listings", () => {
    expect(
      parseIconContainerEntries(
        "--index=1 --width=32 --height=32 --bit-depth=32 --hotspot-x=4 --hotspot-y=7"
      )
    ).toEqual([
      {
        index: 1,
        width: 32,
        height: 32,
        bitDepth: 32,
        hotspotX: 4,
        hotspotY: 7,
      },
    ]);
  });

  test("requires rebuilt cursors to preserve entry dimensions and hotspots", () => {
    expect(
      hasMatchingIconContainerEntries(
        [{ index: 1, width: 32, height: 32, hotspotX: 4, hotspotY: 7 }],
        [{ index: 1, width: 32, height: 32, hotspotX: 4, hotspotY: 8 }],
        "cur"
      )
    ).toBe(false);
  });
});

function createBmpHeaderBuffer(
  bitsPerPixel: number,
  compression: number
): Uint8Array {
  const buffer = Buffer.alloc(54);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(54, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(1, 18);
  buffer.writeInt32LE(1, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bitsPerPixel, 28);
  buffer.writeUInt32LE(compression, 30);
  return buffer;
}
