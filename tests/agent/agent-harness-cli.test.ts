import { resolve } from "node:path";

import { execa } from "execa";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("agent harness scripts", () => {
  test("writes one status JSON document with runtime, skill, and lane data", async () => {
    const result = await runHarness("agent:status", [
      "--json",
      "--path",
      "scripts/agent-status.ts",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "agent:status",
      data: {
        repository: {
          changedPaths: expect.arrayContaining(["scripts/agent-status.ts"]),
        },
        runtime: {
          bun: expect.objectContaining({ expected: "1.3.5" }),
          node: expect.objectContaining({ minimum: "22.13.0" }),
        },
        skills: expect.objectContaining({ available: expect.any(Array) }),
        verification: expect.objectContaining({
          commands: expect.arrayContaining(["bun run test:agent"]),
        }),
      },
      issues: [],
      ok: true,
      schemaVersion: 1,
    });
  });

  test("returns a structured validation error for missing json mode", async () => {
    const result = await runHarness("agent:status", []);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "agent:status",
      data: {},
      issues: [expect.objectContaining({ code: "JSON_REQUIRED" })],
      ok: false,
      schemaVersion: 1,
    });
  });

  test("returns a structured validation error for an external path", async () => {
    const result = await runHarness("agent:preflight", [
      "--json",
      "--path",
      "../outside.ts",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "agent:preflight",
      data: {},
      issues: [expect.objectContaining({ code: "VALIDATION_ERROR" })],
      ok: false,
      schemaVersion: 1,
    });
  });

  test("wraps status in a read-only preflight decision", async () => {
    const result = await runHarness("agent:preflight", ["--json"]);
    const envelope = JSON.parse(result.stdout) as {
      data: { blockers: unknown[]; nextActions: string[]; warnings: unknown[] };
      ok: boolean;
    };

    expect(result.exitCode).toBe(envelope.ok ? 0 : 1);
    expect(envelope.data).toMatchObject({
      blockers: expect.any(Array),
      nextActions: expect.arrayContaining([
        "Run sqz capabilities --json before selecting a Squeezit command.",
      ]),
      warnings: expect.any(Array),
    });
  });
});

async function runHarness(script: string, args: string[]) {
  const result = await execa("bun", ["run", script, ...args], {
    cwd: root,
    reject: false,
  });
  return {
    exitCode: result.exitCode ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
