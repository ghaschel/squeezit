import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

type ClaudeHook = {
  command: string;
  type: string;
};

type ClaudeSettings = {
  hooks: {
    PreToolUse: Array<{
      hooks: ClaudeHook[];
      matcher: string;
    }>;
  };
};

async function readClaudeSettings(): Promise<ClaudeSettings> {
  return JSON.parse(
    await readFile(resolve(root, ".claude/settings.json"), "utf8")
  ) as ClaudeSettings;
}

type CommandResult = {
  code: number | null;
  stderr: string;
  stdout: string;
};

function runCommand(
  command: string,
  arguments_: string[],
  input: string
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stderr, stdout });
    });
    child.stdin.end(input);
  });
}

function runConfiguredHook(command: string, event: object) {
  return runCommand("sh", ["-c", command], JSON.stringify(event));
}

function hookCommand(settings: ClaudeSettings, matcher: string): string {
  const entry = settings.hooks.PreToolUse.find(
    (hook) => hook.matcher === matcher
  );

  if (!entry) {
    throw new Error(`Missing ${matcher} PreToolUse hook`);
  }

  expect(entry.hooks).toEqual([
    {
      command: "bunx --no-install block-no-verify",
      type: "command",
    },
  ]);

  const [configuredHook] = entry.hooks;

  if (!configuredHook) {
    throw new Error(`Missing command for ${matcher} PreToolUse hook`);
  }

  return configuredHook.command;
}

describe("agent commit guardrails", () => {
  test("allows the repository's custom Commitlint type and rejects an unknown type", async () => {
    await expect(
      runCommand(
        "bunx",
        ["--no-install", "commitlint"],
        "improvement: add agent commit guardrails"
      )
    ).resolves.toEqual({ code: 0, stderr: "", stdout: "" });

    await expect(
      runCommand(
        "bunx",
        ["--no-install", "commitlint"],
        "wip: add agent commit guardrails"
      )
    ).resolves.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("[type-enum]"),
    });
  });

  test("blocks a Bash hook bypass through the configured Claude Code hook", async () => {
    const settings = await readClaudeSettings();
    const result = await runConfiguredHook(hookCommand(settings, "Bash"), {
      hook_event_name: "PreToolUse",
      tool_input: { command: "git commit --no-verify" },
      tool_name: "Bash",
    });

    expect(result).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("--no-verify flag is not allowed"),
      stdout: expect.stringContaining('"decision":"block"'),
    });
  });

  test("blocks a GitHub API write through the configured Claude Code hook", async () => {
    const settings = await readClaudeSettings();
    const result = await runConfiguredHook(
      hookCommand(settings, "mcp__github__.*"),
      {
        hook_event_name: "PreToolUse",
        tool_input: {},
        tool_name: "mcp__github__push_files",
      }
    );

    expect(result).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("bypasses local git hooks"),
      stdout: expect.stringContaining('"decision":"block"'),
    });
  });

  test("gives all agents the same local Commitlint and no-bypass workflow", async () => {
    const [agentGuide, skill] = await Promise.all(
      ["AGENTS.md", ".claude/skills/committing-with-commitlint/SKILL.md"].map(
        (path) => readFile(resolve(root, path), "utf8")
      )
    );

    for (const source of [agentGuide, skill]) {
      expect(source).toContain("bunx --no-install commitlint");
      expect(source).toContain("--no-verify");
    }

    expect(agentGuide).toContain("commitlint.config.cjs");
    expect(agentGuide).toContain("HUSKY=0");
    expect(skill).toContain("block-no-verify");
  });
});
