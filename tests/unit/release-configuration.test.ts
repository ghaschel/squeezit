import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

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
    expect(scripts["release:push"]).toBe(
      "bun run release:check && bun run push"
    );
  });
});
