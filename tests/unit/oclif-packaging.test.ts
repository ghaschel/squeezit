import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

async function readPackageJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
}

describe("Oclif package configuration", () => {
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
