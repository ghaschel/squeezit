import { describe, expect, test } from "vitest";

import {
  assertReleaseReady,
  type GitRunner,
} from "../../scripts/check-release-readiness";

function gitRunner(responses: Record<string, string>): GitRunner {
  return async (args) => {
    const response = responses[args.join(" ")];

    if (response === undefined) {
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    }

    return response;
  };
}

describe("release readiness", () => {
  test("accepts a clean main worktree at origin/main", async () => {
    await expect(
      assertReleaseReady(
        gitRunner({
          "status --porcelain": "",
          "branch --show-current": "main\n",
          "rev-parse HEAD": "abc123\n",
          "rev-parse origin/main": "abc123\n",
        })
      )
    ).resolves.toBeUndefined();
  });

  test("rejects a dirty worktree before checking branch or remote state", async () => {
    await expect(
      assertReleaseReady(
        gitRunner({
          "status --porcelain": " M package.json\n",
        })
      )
    ).rejects.toThrow("Release requires a clean worktree");
  });

  test("rejects a non-main branch", async () => {
    await expect(
      assertReleaseReady(
        gitRunner({
          "status --porcelain": "",
          "branch --show-current": "chore/release\n",
        })
      )
    ).rejects.toThrow("Release must run from the local main branch");
  });

  test("rejects a main branch that is not synchronized with origin/main", async () => {
    await expect(
      assertReleaseReady(
        gitRunner({
          "status --porcelain": "",
          "branch --show-current": "main\n",
          "rev-parse HEAD": "abc123\n",
          "rev-parse origin/main": "def456\n",
        })
      )
    ).rejects.toThrow("Release requires HEAD to equal origin/main");
  });
});
