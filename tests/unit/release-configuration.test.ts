import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

async function readPackageJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
}

describe("release configuration", () => {
  test("declares public provenance without changing the public Node floor", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.publishConfig).toEqual({
      access: "public",
      provenance: true,
    });
    expect(packageJson.engines).toMatchObject({ node: ">=22.13.0" });
  });

  test("uses ghaschel/squeezit as the live release source", async () => {
    const packageJson = await readPackageJson();
    const [formulaRenderer, releaseGuide, readme] = await Promise.all(
      [
        "scripts/render-homebrew-formula.ts",
        "docs/releasing.md",
        "README.md",
      ].map((path) => readFile(resolve(root, path), "utf8"))
    );

    expect(packageJson.homepage).toBe(
      "https://github.com/ghaschel/squeezit#readme"
    );
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/ghaschel/squeezit/issues",
    });
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/ghaschel/squeezit.git",
    });

    for (const source of [formulaRenderer, releaseGuide, readme]) {
      expect(source).toContain("ghaschel/squeezit");
      expect(source).not.toContain("ghaschel/squeeze");
    }
  });

  test("embeds Node 24.16.0 for exactly the supported Oclif archives", async () => {
    const packageJson = await readPackageJson();
    const oclif = packageJson.oclif as {
      update?: { node?: { targets?: string[]; version?: string } };
    };

    expect(oclif.update?.node).toEqual({
      version: "24.16.0",
      targets: ["darwin-arm64", "darwin-x64", "linux-x64"],
    });
  });

  test("provides guarded release and push aliases", async () => {
    const packageJson = await readPackageJson();
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts.release).toBe(
      "git fetch --tags --force && bun scripts/check-release-readiness.ts && commit-and-tag-version"
    );
    expect(scripts["release:check"]).toContain("bun install --frozen-lockfile");
    expect(scripts["check:exports"]).toBe("bun run build:library && publint");
    expect(scripts["release:push"]).toBe(
      "bun run release:check && bun run push"
    );
    expect(scripts.postbump).toBe(
      "bun run build:cli && bun run build:manifest"
    );
  });

  test("commits the regenerated Oclif manifest with every version bump", () => {
    const versionrc = require(resolve(root, ".versionrc.cjs")) as {
      bumpFiles?: string[];
    };

    expect(versionrc.bumpFiles).toEqual([
      "package.json",
      "oclif.manifest.json",
    ]);
  });
});
