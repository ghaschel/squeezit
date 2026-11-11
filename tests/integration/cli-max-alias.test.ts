import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterEach, expect, test } from "vitest";

import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const launcher = resolve(import.meta.dirname, "../../bin/run.js");
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

test.each([
  ["compress"],
  ["plan", "compress"],
  ["deps", "doctor"],
  ["deps", "install"],
  ["deps", "upgrade"],
])(
  "accepts max shortcuts with equivalent options for %j",
  async (...command) => {
    const cwd = await createTempWorkspace("sqz-max-alias-");
    workspaces.push(cwd);
    const options: Record<string, unknown>[] = [];
    // Empty discovery exercises the compiled CLI and receipts without running encoders.
    for (const [index, profile] of [
      ["--profile", "max"],
      ["--max"],
      ["-m"],
    ].entries()) {
      const receipt = join(cwd, `receipt-${index}.json`);
      const result = await execa(
        process.execPath,
        [
          launcher,
          ...command,
          "no-matching-input.png",
          ...profile,
          ...(command[0] === "plan"
            ? ["--output", join(cwd, `plan-${index}.json`)]
            : []),
          ...(command[1] === "upgrade" ? ["--dry-run"] : []),
          "--receipt",
          receipt,
          "--json",
        ],
        { cwd, reject: false, env: { FORCE_COLOR: "0", NO_COLOR: "1" } }
      );
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
      expect(result.exitCode).toBe(0);
      options.push(JSON.parse(await readFile(receipt, "utf8")).options);
    }
    expect(options[0]).toMatchObject(
      command[0] === "deps"
        ? { profile: "max" }
        : { max: true, stripMeta: true, threshold: 0 }
    );
    expect(options[1]).toEqual(options[0]);
    expect(options[2]).toEqual(options[0]);
  }
);

test.each(["standard", "max"])(
  "rejects combining --max with an explicit %s profile",
  async (profile) => {
    const result = await execa(
      process.execPath,
      [launcher, "compress", "--max", "--profile", profile, "--json"],
      { reject: false }
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("cannot also be provided"),
      },
    });
  }
);
