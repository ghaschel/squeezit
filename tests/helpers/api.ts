import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, onTestFinished, test } from "vitest";

import { optimizeFile, stripMetadata } from "../../src/api";
import type { ApiOptimizationMode } from "../../src/types";
import {
  type FormatFixture,
  formatFixtures,
  isPlaceholderExpectation,
} from "./fixture-manifest";
import { cleanupWorkspace, copyFixtureToWorkspace } from "./temp";

export function getApiFixture(format: string): FormatFixture {
  const fixture = formatFixtures.find((entry) => entry.format === format);
  if (!fixture) {
    throw new Error(`Missing API fixture for format: ${format}`);
  }

  return fixture;
}

export async function createApiWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-api-"));

  onTestFinished(async () => {
    await cleanupWorkspace(workspace);
  });

  return workspace;
}

export async function copyApiFixtureToWorkspace(
  fixture: FormatFixture,
  workspace: string
): Promise<string> {
  return copyFixtureToWorkspace(
    join(process.cwd(), "tests", "fixtures", "formats", fixture.relativePath),
    workspace
  );
}

type ApiFormatTestOptions = {
  timeout?: number;
};

export function defineApiFormatTests(
  format: string,
  options: ApiFormatTestOptions = {}
): void {
  defineApiModeTests(format, ["default", "exif"], options);
}

export function defineApiMaxFormatTests(
  format: string,
  options: ApiFormatTestOptions = {}
): void {
  defineApiModeTests(format, ["max"], options);
}

function defineApiModeTests(
  format: string,
  modes: ApiOptimizationMode[],
  options: ApiFormatTestOptions
): void {
  const fixture = getApiFixture(format);
  const defineModeTest = (
    mode: ApiOptimizationMode,
    run: (inputPath: string) => Promise<{
      status: string;
      originalSize: number;
      optimizedSize: number;
      savedBytes: number;
    }>
  ): void => {
    const fn = async (): Promise<void> => {
      const expected = fixture.expectations[mode];
      if (isPlaceholderExpectation(expected)) {
        return;
      }

      const workspace = await createApiWorkspace();
      const inputPath = await copyApiFixtureToWorkspace(fixture, workspace);

      const result = await run(inputPath);
      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    };

    if (options.timeout) {
      test(`${format}: ${mode} mode in place`, fn, options.timeout);
      return;
    }

    test(`${format}: ${mode} mode in place`, fn);
  };

  for (const mode of modes) {
    if (mode === "default") {
      defineModeTest(mode, (inputPath) =>
        optimizeFile(inputPath, { mode: "default" })
      );
      continue;
    }

    if (mode === "exif") {
      defineModeTest(mode, (inputPath) => stripMetadata(inputPath));
      continue;
    }

    defineModeTest(mode, (inputPath) =>
      optimizeFile(inputPath, { mode: "max" })
    );
  }
}
