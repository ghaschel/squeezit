import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, test } from "vitest";

import {
  AgentHarnessError,
  type AgentStatusData,
  buildAgentPreflight,
  collectAgentStatus,
  parseGitPorcelain,
  recommendAgentWorkflow,
  resolveRequestedPaths,
} from "../../scripts/agent-harness";

const root = resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("agent harness", () => {
  test("selects matching skills, focused tests, and max coverage from a diff", () => {
    const recommendation = recommendAgentWorkflow({
      changedPaths: [
        "src/cli/commands/compress.ts",
        "src/integrations/vite.ts",
        "scripts/agent-status.ts",
        "tests/integration/api-max.test.ts",
      ],
      diff: "- effort: options.max ? 4 : 2\n+ effort: options.max ? 6 : 4",
    });

    expect(recommendation.skills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining([
        "squeezit-add-command",
        "squeezit-add-image-format",
        "squeezit-add-integration",
      ])
    );
    expect(recommendation.commands).toEqual(
      expect.arrayContaining([
        "bun run verify:agent",
        "bun run test:vite",
        "bun run test:agent",
        "bun run test:slow",
      ])
    );
  });

  test("does not prescribe the slow lane for ordinary optimizer changes", () => {
    const recommendation = recommendAgentWorkflow({
      changedPaths: ["src/utils/optimizer.ts"],
      diff: "message: no removable metadata",
    });

    expect(recommendation.commands).toContain("bun run test:integration");
    expect(recommendation.commands).not.toContain("bun run test:slow");
  });

  test("rejects requested paths outside the repository", () => {
    expect(() => resolveRequestedPaths(root, ["../outside.ts"])).toThrow(
      AgentHarnessError
    );
    expect(() =>
      resolveRequestedPaths(root, [resolve(root, "package.json")])
    ).toThrow(AgentHarnessError);
  });

  test("returns a dependency-unavailable status without importing project code", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "squeezit-agent-harness-"));
    temporaryRoots.push(fixture);
    await execa("git", ["init", "--quiet"], { cwd: fixture });
    await Promise.all([
      writeFile(fixturePath(fixture, "bun.lock"), ""),
      writeFile(
        fixturePath(fixture, "package.json"),
        JSON.stringify({
          engines: { node: ">=22.13.0" },
          name: "fixture",
          packageManager: "bun@1.3.5",
          version: "1.0.0",
        })
      ),
    ]);

    const status = await collectAgentStatus({ root: fixture });

    expect(status.setup).toEqual({ bunLock: true, nodeModules: false });
    expect(status.dependencies).toMatchObject({
      available: false,
      healthy: false,
      tools: [],
    });
    expect(status.installation.status).toBe("unknown");
  });

  test("parses staged, unstaged, and untracked Git paths", () => {
    expect(
      parseGitPorcelain("M  staged.ts\0 M unstaged.ts\0?? new.ts\0")
    ).toEqual([
      { path: "staged.ts", staged: true, status: "M " },
      { path: "unstaged.ts", staged: false, status: " M" },
      { path: "new.ts", staged: false, status: "??" },
    ]);
  });

  test("keeps only the new path for an unstaged rename", () => {
    expect(parseGitPorcelain(" R renamed.ts\0original.ts\0")).toEqual([
      { path: "renamed.ts", staged: false, status: " R" },
    ]);
  });

  test("keeps optimizer health advisory while runtime setup blocks preflight", () => {
    const preflight = buildAgentPreflight(
      createStatus({
        dependencies: {
          available: true,
          healthy: false,
          platform: "darwin",
          tools: [],
          unavailable: 3,
        },
        runtime: {
          bun: { actual: "1.3.4", compatible: false, expected: "1.3.5" },
          node: {
            actual: "24.16.0",
            compatible: true,
            minimum: "22.13.0",
          },
          package: { name: "squeezit", version: "2.3.2" },
          platform: "darwin-arm64",
        },
      })
    );

    expect(preflight.ok).toBe(false);
    expect(preflight.blockers.map((issue) => issue.code)).toEqual([
      "BUN_VERSION_MISMATCH",
    ]);
    expect(preflight.warnings.map((issue) => issue.code)).toContain(
      "OPTIMIZER_UNHEALTHY"
    );
  });

  test("blocks preflight when the Bun install is absent", () => {
    const preflight = buildAgentPreflight(
      createStatus({ setup: { bunLock: true, nodeModules: false } })
    );

    expect(preflight.ok).toBe(false);
    expect(preflight.blockers.map((issue) => issue.code)).toContain(
      "DEPENDENCIES_NOT_INSTALLED"
    );
  });

  test("keeps a missing optimizer advisory when developer setup is ready", () => {
    const preflight = buildAgentPreflight(
      createStatus({
        dependencies: {
          available: true,
          healthy: false,
          platform: "darwin",
          tools: [],
          unavailable: 1,
        },
      })
    );

    expect(preflight.ok).toBe(true);
    expect(preflight.warnings.map((issue) => issue.code)).toContain(
      "OPTIMIZER_UNHEALTHY"
    );
  });
});

function createStatus(
  overrides: Partial<AgentStatusData> = {}
): AgentStatusData {
  return {
    dependencies: {
      available: true,
      healthy: true,
      platform: "darwin",
      tools: [],
      unavailable: 0,
    },
    installation: { status: "healthy", warnings: [] },
    repository: {
      branch: "main",
      changedPaths: [],
      head: "1234567",
      root,
      upstream: { ahead: 0, behind: 0, name: "origin/main" },
      worktree: { clean: true, entries: [] },
    },
    runtime: {
      bun: { actual: "1.3.5", compatible: true, expected: "1.3.5" },
      node: { actual: "24.16.0", compatible: true, minimum: "22.13.0" },
      package: { name: "squeezit", version: "2.3.2" },
      platform: "darwin-arm64",
    },
    setup: { bunLock: true, nodeModules: true },
    skills: { available: [], recommended: [] },
    verification: {
      commands: ["bun run verify:agent"],
      reasons: [],
      skills: [],
      slowRequired: false,
    },
    ...overrides,
  };
}

function fixturePath(root: string, path: string): string {
  return join(root, path);
}
