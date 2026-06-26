import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fsExtra from "fs-extra";
import { afterEach, describe, expect, test } from "vitest";

import {
  getOptimizationFixtureValues,
  optimizeFile,
  optimizeFiles,
  stripMetadata,
} from "../../src/api";
import { runCheckedCommand } from "../../src/utils/exec";
import {
  formatFixtures,
  isPlaceholderExpectation,
  representativeFixtures,
} from "../helpers/fixture-manifest";
import { cleanupWorkspace, copyFixtureToWorkspace } from "../helpers/temp";

const { pathExists } = fsExtra;

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("api integration", () => {
  for (const fixture of formatFixtures) {
    const testFixture = (name: string, fn: () => Promise<void>): void => {
      if (fixture.format === "webp") {
        test(name, fn, 15_000);
        return;
      }

      test(name, fn);
    };

    testFixture(`${fixture.format}: default mode in place`, async () => {
      const expected = fixture.expectations.default;
      if (isPlaceholderExpectation(expected)) {
        return;
      }

      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await optimizeFile(inputPath, { mode: "default" });
      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });

    testFixture(`${fixture.format}: exif mode in place`, async () => {
      const expected = fixture.expectations.exif;
      if (isPlaceholderExpectation(expected)) {
        return;
      }

      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await stripMetadata(inputPath);
      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });

    testFixture(`${fixture.format}: max mode in place`, async () => {
      const expected = fixture.expectations.max;
      if (isPlaceholderExpectation(expected)) {
        return;
      }

      const workspace = await createWorkspace();
      const inputPath = await copyFixtureToWorkspace(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "formats",
          fixture.relativePath
        ),
        workspace
      );

      const result = await optimizeFile(inputPath, { mode: "max" });
      expect(result.status).toBe(expected.status);
      expect(result.originalSize).toBe(expected.originalSize);
      expect(result.optimizedSize).toBe(expected.optimizedSize);
      expect(result.savedBytes).toBe(expected.savedBytes);
    });
  }

  test("writes to an output directory without mutating the source", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const outputDir = join(workspace, "out");
    const originalStats = await stat(inputPath);

    const result = await optimizeFile(inputPath, {
      mode: "default",
      cwd: workspace,
      outputDir,
      keepTime: true,
    });

    expect(result.outputPath.startsWith("out/")).toBe(true);
    expect(await pathExists(join(workspace, result.outputPath))).toBe(true);
    expect((await stat(inputPath)).size).toBe(originalStats.size);
  });

  test("supports dry run without writing output files", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const outputDir = join(workspace, "dry-run-out");

    const result = await optimizeFile(inputPath, {
      mode: "max",
      cwd: workspace,
      outputDir,
      dryRun: true,
    });

    expect(result.status).toBe("dry-run");
    expect(await pathExists(join(workspace, result.outputPath))).toBe(false);
  });

  test("supports batch processing with recursive discovery", async () => {
    const workspace = await createWorkspace();
    await copyFixtureToWorkspace(representativeFixtures.png, workspace);
    await copyFixtureToWorkspace(representativeFixtures.jpeg, workspace);

    const result = await optimizeFiles([], {
      cwd: workspace,
      recursive: true,
      mode: "default",
    });

    expect(result.results.length).toBeGreaterThanOrEqual(2);
  });

  test("optimizes static webp with the static lossless path", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.webp,
      workspace
    );

    const result = await optimizeFile(inputPath, { mode: "default" });
    const info = await runCheckedCommand("webpinfo", [inputPath]);

    expect(result.label).toBe("[WEBP]");
    expect(result.status).toBe("optimized");
    expect(result.optimizedSize).toBe(517842);
    expect(info.all).toMatch(/Format: Lossy \(1\)/);
    expect(info.all).not.toMatch(/^Chunk XMP\b/m);
  }, 15_000);

  test("optimizes animated webp directly as lossless webp frames", async () => {
    const workspace = await createWorkspace();
    const inputPath = join(workspace, "animated.webp");
    await runCheckedCommand("magick", [
      "-size",
      "2x2",
      "xc:red",
      "-delay",
      "10",
      "-size",
      "2x2",
      "xc:blue",
      inputPath,
    ]);

    const result = await optimizeFile(inputPath, {
      mode: "default",
      threshold: 0,
    });
    const info = await runCheckedCommand("webpinfo", [inputPath]);

    expect(result.label).toBe("[WEBP-ANIM]");
    expect(result.status).toBe("optimized");
    expect(info.all).toMatch(/^\s*Animation:\s*1\b/m);
    expect(info.all).toMatch(/^Chunk ANIM\b/m);
    expect(
      info.all.match(/Format: Lossless \(2\)/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(info.all).not.toMatch(/Format: Lossy \(1\)/);
  });

  test("exposes fixture helper values for assertion updates", async () => {
    const workspace = await createWorkspace();
    const inputPath = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );

    const values = await getOptimizationFixtureValues(inputPath, {
      mode: "default",
    });

    expect(values.filePath.endsWith("png/sample.png")).toBe(true);
    expect(typeof values.originalSize).toBe("number");
    expect(typeof values.optimizedSize).toBe("number");
    expect(typeof values.savedBytes).toBe("number");
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-api-"));
  workspaces.push(workspace);
  return workspace;
}
