import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("test lane scripts", () => {
  test("defines a safe default suite and an explicit full suite", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.scripts.test).toBe(
      "bun run test:fast && bun run test:cli && bun run test:integration"
    );
    expect(packageJson.scripts["test:all"]).toBe(
      "bun test && bun run test:slow"
    );
    expect(packageJson.scripts["test:slow"]).toBe(
      "vitest run tests/integration/api-max.test.ts --maxWorkers 1 --maxConcurrency 1"
    );
  });

  test("keeps fast, CLI, and integration ownership non-overlapping", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.scripts["test:fast"]).toBe(
      "vitest run tests/unit --exclude tests/unit/cli-*.test.ts --exclude tests/unit/oclif-packaging.test.ts"
    );
    expect(packageJson.scripts["test:integration"]).toBe(
      "vitest run tests/integration --exclude tests/integration/cli-*.test.ts --exclude tests/integration/api-max.test.ts"
    );
    expect(packageJson.scripts["test:api"]).toBe(
      "vitest run tests/integration/api-*.test.ts --exclude tests/integration/api-max.test.ts"
    );
  });

  test("makes agent verification safe and comprehensive without slow compression", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.scripts["verify:agent"]).toBe(
      "bun run typecheck && bun run test:fast && bun run test:cli && bun run check:exports && npm pack --dry-run"
    );
  });

  test("registers every real max-profile format test in the dedicated slow suite", async () => {
    const source = await readFile(
      resolve(root, "tests/integration/api-max.test.ts"),
      "utf8"
    );

    expect(source).toContain("formatFixtures");
    expect(source).toContain("defineApiMaxFormatTests");
  });
});

async function readPackageJson(): Promise<{
  scripts: Record<string, string>;
}> {
  return JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
}
