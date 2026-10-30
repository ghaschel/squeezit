import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { glob } from "glob";
import { describe, expect, test } from "vitest";

import { runCheckedCommand, runCommand } from "../../src/utils/exec";

describe("refreshed runtime dependency contracts", () => {
  test("awaits process output and retains nonzero results and checked errors", async () => {
    const script =
      'process.stdout.write("output"); process.stderr.write("failure"); process.exitCode = 7';
    const result = await runCommand(process.execPath, ["-e", script]);
    expect(result).toMatchObject({
      exitCode: 7,
      stdout: "output",
      stderr: "failure",
    });
    expect(result.all).toContain("output");
    expect(result.all).toContain("failure");
    await expect(
      runCheckedCommand(process.execPath, ["-e", script])
    ).rejects.toThrow("failure");
  });

  test("interprets numeric FORCE_COLOR levels in a fresh process", async () => {
    for (const level of [0, 1, 2, 3]) {
      const result = await runCommand(process.execPath, [
        "--input-type=module",
        "-e",
        `process.env.FORCE_COLOR = "${level}"; const {default: chalk} = await import("chalk"); console.log(JSON.stringify({level: chalk.level, text: chalk.red("asset")}));`,
      ]);
      expect(result.exitCode).toBe(0);
      const value = JSON.parse(result.stdout);
      expect(value.level).toBe(level);
      expect(value.text.includes("\u001b[")).toBe(level > 0);
    }
  });

  test("retains brace, extglob, ignore, and case-sensitive path behavior", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "squeezit-glob-contract-"));
    try {
      await mkdir(join(cwd, "nested"));
      await Promise.all(
        ["a.png", "b.jpg", "UPPER.PNG", "nested/skip.png"].map((name) =>
          writeFile(join(cwd, name), "asset")
        )
      );
      expect(
        (
          await glob("**/*.{png,jpg}", {
            cwd,
            ignore: "nested/**",
            nocase: false,
          })
        ).sort()
      ).toEqual(["a.png", "b.jpg"]);
      expect((await glob("+(a|b).@(png|jpg)", { cwd })).sort()).toEqual([
        "a.png",
        "b.jpg",
      ]);
      expect(await glob("u*.png", { cwd, nocase: false })).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
