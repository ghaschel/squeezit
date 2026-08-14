import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { CoreOptimizationOptions } from "../../src/types";
import { optimizeImage } from "../../src/utils/optimizer";

const jpegFixture = join(
  process.cwd(),
  "tests",
  "fixtures",
  "formats",
  "jpeg",
  "sample.jpg"
);

describe("JPEG optimization", () => {
  test("uses MozJPEG alone for the standard profile", async () => {
    await withFakeJpegTools(async ({ inputPath }) => {
      const result = await optimizeImage(
        { absolutePath: inputPath, displayPath: "input.jpg" },
        createOptions({ max: false, stripMeta: false })
      );

      expect(result).toMatchObject({
        label: "[JPEG]",
        status: "optimized",
      });
      expect((await stat(inputPath)).size).toBe(2);
    });
  });

  test("keeps the smaller independent JPEGoptim candidate for the max profile", async () => {
    await withFakeJpegTools(async ({ inputPath }) => {
      const result = await optimizeImage(
        { absolutePath: inputPath, displayPath: "input.jpg" },
        createOptions({ max: true, stripMeta: true })
      );

      expect(result).toMatchObject({
        label: "[JPEG]",
        optimizedSize: 1,
        status: "optimized",
      });
      expect((await readFile(inputPath)).length).toBe(1);
    });
  });
});

function createOptions(
  overrides: Pick<CoreOptimizationOptions, "max" | "stripMeta">
): CoreOptimizationOptions {
  return {
    concurrency: 1,
    dryRun: false,
    exifOnly: false,
    inPlace: false,
    keepTime: false,
    threshold: 0,
    ...overrides,
  };
}

async function withFakeJpegTools(
  run: (paths: { inputPath: string }) => Promise<void>
): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-jpeg-unit-"));
  const toolsDirectory = join(workspace, "bin");
  const inputPath = join(workspace, "input.jpg");
  const originalPath = process.env.PATH;
  const originalMozjpeg = process.env.SQUEEZIT_MOZJPEGTRAN;
  const mozjpegPath = join(toolsDirectory, "mozjpeg-jpegtran");

  try {
    await mkdir(toolsDirectory);
    await writeExecutable(
      mozjpegPath,
      '#!/bin/sh\nfor argument in "$@"; do input="$argument"; done\nhead -c 2 "$input"\n'
    );
    await writeExecutable(
      join(toolsDirectory, "jpegtran"),
      '#!/bin/sh\nfor argument in "$@"; do input="$argument"; done\nhead -c 2 "$input"\n'
    );
    await writeExecutable(
      join(toolsDirectory, "jpegoptim"),
      '#!/bin/sh\nfor argument in "$@"; do input="$argument"; done\nhead -c 1 "$input" > "$input.tmp"\nmv "$input.tmp" "$input"\n'
    );
    await writeExecutable(
      join(toolsDirectory, "jpegrescan"),
      '#!/bin/sh\necho "jpegrescan must not run" >&2\nexit 99\n'
    );
    await copyFile(jpegFixture, inputPath);

    process.env.PATH = `${toolsDirectory}:/usr/bin:/bin`;
    process.env.SQUEEZIT_MOZJPEGTRAN = mozjpegPath;

    await run({ inputPath });
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }

    if (originalMozjpeg === undefined) {
      delete process.env.SQUEEZIT_MOZJPEGTRAN;
    } else {
      process.env.SQUEEZIT_MOZJPEGTRAN = originalMozjpeg;
    }

    await rm(workspace, { force: true, recursive: true });
  }
}

async function writeExecutable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { mode: 0o755 });
  await chmod(path, 0o755);
}
