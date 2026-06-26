import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import { runCheckedCommand } from "../../src/utils/exec";
import {
  copyApiFixtureToWorkspace,
  createApiWorkspace,
  defineApiFormatTests,
  getApiFixture,
} from "../helpers/api";

describe("api webp integration", () => {
  defineApiFormatTests("webp", { timeout: 15_000 });

  test("optimizes static webp with the static lossless path", async () => {
    const workspace = await createApiWorkspace();
    const fixture = getApiFixture("webp");
    const inputPath = await copyApiFixtureToWorkspace(fixture, workspace);

    const result = await optimizeFile(inputPath, { mode: "default" });
    const info = await runCheckedCommand("webpinfo", [inputPath]);

    expect(result.label).toBe("[WEBP]");
    expect(result.status).toBe("optimized");
    expect(result.optimizedSize).toBe(517842);
    expect(info.all).toMatch(/Format: Lossy \(1\)/);
    expect(info.all).not.toMatch(/^Chunk XMP\b/m);
  }, 15_000);

  test("optimizes animated webp directly as lossless webp frames", async () => {
    const workspace = await createApiWorkspace();
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
});
