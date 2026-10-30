import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

async function readPackageJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
}

describe("Oclif package configuration", () => {
  test("packs public documentation without internal plans or audit evidence", async () => {
    const cache = await mkdtemp(resolve(tmpdir(), "sqz-pack-cache-"));
    const { stdout } = await run(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: root,
        env: { ...process.env, npm_config_cache: cache },
        maxBuffer: 16 * 1024 * 1024,
      }
    ).finally(() => rm(cache, { recursive: true, force: true }));
    const packages = JSON.parse(stdout) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = (packages[0]?.files ?? []).map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "docs/API.md",
        "README.md",
        "bin/run.js",
        "dist/index.js",
        "oclif.manifest.json",
      ])
    );
    expect(paths.some((path) => path.startsWith("docs/superpowers/"))).toBe(
      false
    );
    expect(paths.some((path) => path.startsWith(".superpowers/"))).toBe(false);
  }, 30_000);

  test("publishes the Oclif launcher, command manifest, and canonical binary aliases", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.bin).toEqual({
      sqz: "./bin/run.js",
      squeezit: "./bin/run.js",
    });
    expect(packageJson.files).toEqual(
      expect.arrayContaining(["bin", "dist", "oclif.manifest.json", "schemas"])
    );
    expect(packageJson.exports).toMatchObject({
      "./schemas/*.json": "./schemas/*.json",
    });
    expect(packageJson.oclif).toMatchObject({
      bin: "sqz",
      binAliases: ["squeezit"],
      commands: "./dist/commands",
      plugins: ["@oclif/plugin-autocomplete", "@oclif/plugin-not-found"],
      topicSeparator: " ",
    });
  });

  test("uses only the approved Oclif runtime plugins", async () => {
    const packageJson = await readPackageJson();
    const dependencies = packageJson.dependencies as Record<string, string>;
    const devDependencies = packageJson.devDependencies as Record<
      string,
      string
    >;

    expect(dependencies["@oclif/core"]).toBeDefined();
    expect(dependencies["@oclif/plugin-autocomplete"]).toBeDefined();
    expect(dependencies["@oclif/plugin-not-found"]).toBeDefined();
    expect(dependencies.commander).toBeUndefined();
    expect(devDependencies.oclif).toBeDefined();
  });
});
