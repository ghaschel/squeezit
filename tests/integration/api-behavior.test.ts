import { stat } from "node:fs/promises";
import { join } from "node:path";

import fsExtra from "fs-extra";
import { describe, expect, test } from "vitest";

import {
  getOptimizationFixtureValues,
  optimizeFile,
  optimizeFiles,
} from "../../src/api";
import { createApiWorkspace } from "../helpers/api";
import { representativeFixtures } from "../helpers/fixture-manifest";
import { copyFixtureToWorkspace } from "../helpers/temp";

const { pathExists } = fsExtra;

describe("api behavior integration", () => {
  test("writes to an output directory without mutating the source", async () => {
    const workspace = await createApiWorkspace();
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
    const workspace = await createApiWorkspace();
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
    const workspace = await createApiWorkspace();
    await copyFixtureToWorkspace(representativeFixtures.png, workspace);
    await copyFixtureToWorkspace(representativeFixtures.jpeg, workspace);

    const result = await optimizeFiles([], {
      cwd: workspace,
      recursive: true,
      mode: "default",
    });

    expect(result.results.length).toBeGreaterThanOrEqual(2);
  });

  test("exposes fixture helper values for assertion updates", async () => {
    const workspace = await createApiWorkspace();
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
