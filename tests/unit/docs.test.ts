import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import * as api from "../../src/api";
import { squeezitAstro } from "../../src/integrations/astro";
import { squeezitBabel } from "../../src/integrations/babel";
import { squeezitEsbuild } from "../../src/integrations/esbuild";
import { registerSqueezitTask } from "../../src/integrations/grunt";
import { squeezitGulp } from "../../src/integrations/gulp";
import { withSqueezit } from "../../src/integrations/next";
import { squeezitParcel } from "../../src/integrations/parcel";
import { squeezitRollup } from "../../src/integrations/rollup";
import { squeezitVite } from "../../src/integrations/vite";
import { squeezitWebpack } from "../../src/integrations/webpack";

describe("documentation coverage", () => {
  test("documents integrations in the readme", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("## Integrations");
    expect(readme).toContain("squeezit/gulp");
    expect(readme).toContain("squeezit/vite");
    expect(readme).toContain("squeezit/webpack");
    expect(readme).toContain("squeezit/rollup");
    expect(readme).toContain("squeezit/parcel");
    expect(readme).toContain("squeezit/astro");
    expect(readme).toContain("squeezit/next");
    expect(readme).toContain("squeezit/esbuild");
    expect(readme).toContain("squeezit/babel");
  });

  test("documents the 2.0 command taxonomy and automation contract", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("sqz compress [patterns...]");
    expect(readme).toContain("sqz metadata strip [patterns...]");
    expect(readme).toContain(
      "sqz plan compress [patterns...] --output <plan.json>"
    );
    expect(readme).toContain("sqz plan apply <plan.json> --yes");
    expect(readme).toContain("sqz deps doctor [patterns...]");
    expect(readme).toContain("sqz update check");
    expect(readme).toContain("sqz autocomplete zsh");
    expect(readme).toContain('"schemaVersion": 2');
    expect(readme).toContain("sqz capabilities --json");
    expect(readme).toContain("--events jsonl");
    expect(readme).toContain("docs/agent-contract.md");
    expect(readme).toContain("command-events-v1.schema.json");
    expect(readme).toContain("optimization-plan-v1.schema.json");
    expect(readme).toContain("## Migrating to 2.0");
  });

  test("documents one-archive standalone checksum verification", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain('ARCHIVE="squeezit-v<VERSION>-<target>.tar.gz"');
    expect(readme).toContain(
      'grep "  $ARCHIVE$" SHA256SUMS | shasum -a 256 -c -'
    );
    expect(readme).not.toContain("shasum -a 256 -c SHA256SUMS");
  });

  test("contains dedicated API documentation", async () => {
    const apiDocs = await readFile(
      join(process.cwd(), "docs", "API.md"),
      "utf8"
    );

    expect(apiDocs).toContain("optimizeFile");
    expect(apiDocs).toContain("optimizeFiles");
    expect(apiDocs).toContain("stripMetadata");
    expect(apiDocs).toContain("getOptimizationFixtureValues");
  });

  test("exports the documented public api functions", () => {
    expect(typeof api.optimizeFile).toBe("function");
    expect(typeof api.optimizeFiles).toBe("function");
    expect(typeof api.stripMetadata).toBe("function");
    expect(typeof api.getOptimizationFixtureValues).toBe("function");
  });

  test("exports the vite integration", () => {
    expect(typeof squeezitVite).toBe("function");
  });

  test("exports the webpack integration", () => {
    expect(typeof squeezitWebpack).toBe("function");
  });

  test("exports the rollup integration", () => {
    expect(typeof squeezitRollup).toBe("function");
  });

  test("exports the parcel integration", () => {
    expect(typeof squeezitParcel).toBe("object");
  });

  test("exports the astro integration", () => {
    expect(typeof squeezitAstro).toBe("function");
  });

  test("exports the next integration", () => {
    expect(typeof withSqueezit).toBe("function");
  });

  test("exports the gulp integration", () => {
    expect(typeof squeezitGulp).toBe("function");
  });

  test("exports the grunt integration", () => {
    expect(typeof registerSqueezitTask).toBe("function");
  });

  test("exports the esbuild integration", () => {
    expect(typeof squeezitEsbuild).toBe("function");
  });

  test("exports the babel integration", () => {
    expect(typeof squeezitBabel).toBe("function");
  });

  test("declares the root and planned integration exports in package.json", async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8")
    ) as { exports?: Record<string, unknown> };

    expect(Object.keys(packageJson.exports ?? {})).toEqual(
      expect.arrayContaining([
        ".",
        "./gulp",
        "./vite",
        "./webpack",
        "./rollup",
        "./parcel",
        "./astro",
        "./next",
        "./esbuild",
        "./babel",
        "./grunt",
      ])
    );
  });
});
