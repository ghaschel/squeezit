import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { execa } from "execa";
import { describe, expect, test } from "vitest";

import { representativeFixtures } from "../helpers/fixture-manifest";
import {
  cleanupWorkspace,
  copyFixtureToWorkspace,
  createTempWorkspace,
} from "../helpers/temp";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "bin/run.js");

interface JsonEnvelope {
  schemaVersion: 2;
  command: string;
  ok: boolean;
  data: unknown;
  meta: {
    cwd: string;
    executablePath: string;
    invocationPath: string;
    nodeVersion: string;
    packageRoot: string;
    platform: string;
    squeezitVersion: string;
  };
  error?: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    remediation: string;
  };
}

describe("CLI JSON v2 contract", () => {
  test("reports provenance for the binary that produced a command result", async () => {
    const result = await runJson(["commands", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: "commands",
      meta: {
        cwd: root,
        executablePath: expect.stringContaining("bin/run.js"),
        invocationPath: expect.stringContaining("bin/run.js"),
        nodeVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        packageRoot: root,
        platform: expect.stringMatching(/^[a-z0-9]+-[a-z0-9]+$/),
        squeezitVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      },
      ok: true,
      schemaVersion: 2,
    });
  });

  test("classifies option validation without requiring agents to parse prose", async () => {
    const result = await runJson([
      "compress",
      "--profile",
      "unsupported",
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toMatchObject({
      command: "compress",
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Expected --profile=unsupported"),
        remediation: expect.any(String),
      },
      ok: false,
      schemaVersion: 2,
    });
  });

  test("classifies an unknown help target without requiring agents to parse prose", async () => {
    const result = await runJson(["help", "not-a-command", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toMatchObject({
      command: "help",
      error: {
        code: "UNKNOWN_COMMAND",
        message: "Unknown command: not-a-command",
        remediation: expect.any(String),
      },
      ok: false,
      schemaVersion: 2,
    });
  });

  test("reports installation ambiguity separately from readiness", async () => {
    const result = await runJson(["doctor", "--json"]);

    expect(result.exitCode).toBe(result.envelope.ok ? 0 : 1);
    expect(result.envelope).toMatchObject({
      command: "doctor",
      data: {
        installation: {
          candidates: expect.any(Array),
          duplicates: expect.any(Array),
          status: expect.stringMatching(/^(healthy|warning)$/),
          warnings: expect.any(Array),
        },
      },
      schemaVersion: 2,
    });
  });

  test("rejects an explicit unsupported file before it can be changed", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-contract-");
    const input = resolve(workspace, "notes.txt");
    await writeFile(input, "not an image");

    try {
      const result = await runJson(["compress", input, "--json"]);

      expect(result.exitCode).toBe(1);
      expect(result.envelope).toMatchObject({
        command: "compress",
        error: {
          code: "UNSUPPORTED_FORMAT",
          details: { paths: [input] },
          remediation: expect.any(String),
        },
        ok: false,
      });
    } finally {
      await cleanupWorkspace(workspace);
    }
  });

  test("requires an explicit confirmation for a JSON file-changing operation", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-contract-");
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );

    try {
      const result = await runJson(["compress", input, "--json"], {
        cwd: workspace,
      });

      expect(result.exitCode).toBe(1);
      expect(result.envelope).toMatchObject({
        command: "compress",
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: expect.stringContaining("--yes is required"),
          remediation: expect.any(String),
        },
        ok: false,
      });
    } finally {
      await cleanupWorkspace(workspace);
    }
  });

  test("classifies missing optimizer dependencies without parsing prose", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-contract-");
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );

    try {
      const result = await runJson(["compress", input, "--dry-run", "--json"], {
        cwd: workspace,
        env: { PATH: "" },
      });

      expect(result.exitCode).toBe(1);
      expect(result.envelope).toMatchObject({
        command: "compress",
        error: {
          code: "DEPENDENCY_MISSING",
          remediation: expect.stringContaining("sqz deps install"),
        },
        ok: false,
      });
    } finally {
      await cleanupWorkspace(workspace);
    }
  });
});

async function runJson(
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {}
): Promise<{
  envelope: JsonEnvelope;
  exitCode: number;
}> {
  const result = await execa(process.execPath, [launcher, ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    reject: false,
  });

  expect(result.stderr).toBe("");
  const envelope = JSON.parse(result.stdout) as JsonEnvelope;
  expect(result.exitCode ?? 1).toBe(envelope.ok ? 0 : 1);

  return { envelope, exitCode: result.exitCode ?? 1 };
}
