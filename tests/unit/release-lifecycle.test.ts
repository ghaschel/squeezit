import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

test("release bump executes the configured CLI and manifest rebuild", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "sqz-release-bump-"));
  try {
    const packageJson = JSON.parse(
      await readFile(join(root, "package.json"), "utf8")
    );
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        version: "1.0.0",
        scripts: {
          postbump: packageJson.scripts.postbump,
          "build:cli": "node rebuild.mjs cli",
          "build:manifest": "node rebuild.mjs manifest",
        },
      })
    );
    await writeFile(
      join(workspace, ".versionrc.cjs"),
      await readFile(join(root, ".versionrc.cjs"), "utf8")
    );
    await writeFile(
      join(workspace, "oclif.manifest.json"),
      JSON.stringify({ version: "1.0.0", commands: {} })
    );
    await writeFile(
      join(workspace, "rebuild.mjs"),
      `import { readFileSync, writeFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (process.argv[2] === "cli") {
  writeFileSync("built-cli-version.txt", version);
} else {
  const builtVersion = readFileSync("built-cli-version.txt", "utf8");
  writeFileSync("oclif.manifest.json", JSON.stringify({ version, builtVersion }));
}
`
    );
    await execa(
      process.execPath,
      [
        join(root, "node_modules/commit-and-tag-version/bin/cli.js"),
        "--release-as",
        "1.0.1",
        "--skip.changelog",
        "--skip.commit",
        "--skip.tag",
      ],
      { cwd: workspace }
    );

    expect(
      JSON.parse(await readFile(join(workspace, "oclif.manifest.json"), "utf8"))
    ).toEqual({ version: "1.0.1", builtVersion: "1.0.1" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test.each([false, true])(
  "release tag annotation works with linked worktree=%s",
  async (linked) => {
    const workspace = await mkdtemp(join(tmpdir(), "sqz-release-tag-"));
    const checkout = join(workspace, "checkout");
    try {
      await execa("git", ["init", "--initial-branch=main", checkout]);
      const git = (args: string[], cwd = checkout) =>
        execa(
          "git",
          [
            "-c",
            "user.name=Release Fixture",
            "-c",
            "user.email=release-fixture@example.invalid",
            ...args,
          ],
          { cwd }
        );
      await mkdir(join(checkout, "changelogs"));
      await writeFile(join(checkout, "package.json"), '{"version":"1.0.1"}\n');
      await writeFile(
        join(checkout, "changelogs/1.0.1.md"),
        "# Changelog\n\n## 1.0.1 (2026-11-11)\n\n### Features\n\n- Release fixture\n"
      );
      await git(["add", "package.json", "changelogs/1.0.1.md"]);
      await git(["commit", "-m", "chore: seed release fixture"]);
      const cwd = linked ? join(workspace, "linked") : checkout;
      if (linked) await git(["worktree", "add", "-b", "release-fixture", cwd]);
      await git(["tag", "-a", "v1.0.1", "-m", "initial annotation"], cwd);
      await execa(
        process.execPath,
        [join(root, "scripts/custom-tag-message.mjs")],
        {
          cwd,
          env: {
            GIT_COMMITTER_NAME: "Release Fixture",
            GIT_COMMITTER_EMAIL: "release-fixture@example.invalid",
          },
        }
      );

      const annotation = await git(
        ["for-each-ref", "--format=%(contents)", "refs/tags/v1.0.1"],
        cwd
      );
      expect(annotation.stdout).toContain("chore(release): v1.0.1");
      expect(annotation.stdout).toContain("- Release fixture");
      const tag = await git(["rev-parse", "v1.0.1^{commit}"], cwd);
      const head = await git(["rev-parse", "HEAD"], cwd);
      expect(tag.stdout).toBe(head.stdout);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
);
