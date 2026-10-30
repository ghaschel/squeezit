import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

test("changelog amendment keeps hooks enabled and stops on rejection", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "sqz-changelog-"));
  try {
    // An isolated command stub rejects amendment without touching a real repository.
    await writeFile(
      join(workspace, "git"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> git-calls.txt\nif [ "$1" = commit ]; then exit 1; fi\n'
    );
    await chmod(join(workspace, "git"), 0o755);
    await writeFile(
      join(workspace, "CHANGELOG.md"),
      "# Changelog\n\n## 2.5.0 (2026-10-30)\n\n### Features\n\n- PDF support\n"
    );

    const result = await execa(
      process.execPath,
      [resolve(root, "scripts/split-changelog.mjs")],
      {
        cwd: workspace,
        env: { PATH: `${workspace}:${process.env.PATH}` },
        reject: false,
      }
    );

    const calls = await readFile(join(workspace, "git-calls.txt"), "utf8");
    expect(calls).toContain("commit --amend --no-edit\n");
    expect(calls).not.toContain("--no-verify");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Failed to amend commit");
    expect(
      await readFile(join(workspace, "changelogs/2.5.0.md"), "utf8")
    ).toContain("PDF support");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
