import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
};
async function workflow() {
  return parse(
    await readFile(resolve(root, ".github/workflows/compatibility.yml"), "utf8")
  ) as {
    permissions: Record<string, string>;
    jobs: {
      compatibility: {
        strategy: { matrix: { include: Array<Record<string, unknown>> } };
        steps: Step[];
      };
    };
  };
}

describe("consumer and QPDF compatibility workflow", () => {
  test("bounds the platform/runtime/native matrix independently of the build pin", async () => {
    const value = await workflow();
    expect(value.permissions).toEqual({ contents: "read" });
    expect(value.jobs.compatibility.strategy.matrix.include).toEqual([
      {
        os: "ubuntu-latest",
        node: "22.13.0",
        qpdf: "11.3.0",
        hostFloors: false,
      },
      {
        os: "ubuntu-latest",
        node: "24.22.2",
        qpdf: "12.4.2",
        hostFloors: true,
      },
      {
        os: "ubuntu-latest",
        node: "22.23.4",
        qpdf: "12.4.2",
        hostFloors: false,
      },
      {
        os: "macos-26-intel",
        node: "26.13.0",
        qpdf: "12.4.2",
        hostFloors: false,
      },
      {
        os: "ubuntu-latest",
        node: "26.13.0",
        qpdf: "12.4.2",
        hostFloors: false,
      },
      {
        os: "macos-latest",
        node: "26.13.0",
        qpdf: "12.4.2",
        hostFloors: false,
      },
    ]);
    const steps = value.jobs.compatibility.steps;
    const firstNode = steps.findIndex((step) =>
      step.uses?.startsWith("actions/setup-node@")
    );
    expect(
      steps
        .slice(0, firstNode)
        .some((step) => step.run?.includes("apt-get install --yes libatomic1"))
    ).toBe(true);
    const nodes = steps.filter((step) =>
      step.uses?.startsWith("actions/setup-node@")
    );
    expect(nodes.map((step) => step.with?.["node-version"])).toEqual([
      "26.13.0",
      "${{ matrix.node }}",
    ]);
    expect(
      steps.find((step) => step.uses?.startsWith("oven-sh/setup-bun@"))?.with
    ).toEqual({ "bun-version": "1.4.4" });
  });

  test("checks receipts and runs native PDF and built consumer contracts without publishing", async () => {
    const steps = (await workflow()).jobs.compatibility.steps;
    const source = steps.map((step) => step.run ?? "").join("\n");
    expect(source).toContain(
      "547cee67de77b5c4ef4917e57d2db9c848cfe3aa950361f68d36367a3a03936e"
    );
    expect(source).toContain("bun scripts/native-tool-target.ts qpdf");
    expect(source).toContain("shasum --algorithm 256 --check");
    expect(source).toContain(
      'echo "$(brew --prefix openssl@3)/bin" >> "$GITHUB_PATH"'
    );
    expect(source).toContain(
      "tests/unit/pdf.test.ts tests/integration/pdf-process.test.ts tests/integration/api-pdf.test.ts tests/integration/api-pdf-signatures.test.ts tests/integration/api-pdf-preservation.test.ts"
    );
    expect(source).toContain('import("./dist/index.js")');
    expect(source).toContain('require("./dist/index.cjs")');
    expect(source).toContain("node bin/run.js capabilities --json");
    expect(source).toContain("tests/helpers/adapter-host-compatibility.cjs");
    expect(source).toContain(
      "babel,esbuild,astro,gulp,grunt,rollup,vite,webpack,parcel,next"
    );
    const floorManifest = source.match(/<<'JSON'\n([\s\S]*?)\nJSON/);
    expect(floorManifest).not.toBeNull();
    expect(JSON.parse(floorManifest![1]!).dependencies).toMatchObject({
      "@babel/core": "7.0.0",
      astro: "5.18.0",
      esbuild: "0.27.4",
      gulp: "5.0.1",
      grunt: "1.6.1",
      parcel: "2.16.0",
      "@parcel/core": "2.16.0",
      "@parcel/config-default": "2.16.0",
      "@parcel/transformer-raw": "2.16.0",
      "@parcel/cache": "2.16.0",
      "@parcel/fs": "2.16.0",
      rollup: "4.52.3",
      vite: "8.0.2",
      webpack: "5.105.4",
      next: "16.2.1",
      react: "19.2.4",
      "react-dom": "19.2.4",
    });
    expect(source).not.toMatch(/npm publish|git push|gh release|HUSKY=0/);
    expect(
      steps.every((step) => !step.uses || /@[a-f0-9]{40}$/.test(step.uses))
    ).toBe(true);
  });

  test("uses syntactically valid Bash run blocks", async () => {
    for (const step of (await workflow()).jobs.compatibility.steps) {
      if (step.run)
        await expect(
          run("bash", ["-n", "-c", step.run])
        ).resolves.toMatchObject({ stderr: "" });
    }
  });
});
