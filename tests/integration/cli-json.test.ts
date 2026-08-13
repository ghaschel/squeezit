import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, test } from "vitest";

import { representativeFixtures } from "../helpers/fixture-manifest";
import {
  cleanupWorkspace,
  copyFixtureToWorkspace,
  createTempWorkspace,
} from "../helpers/temp";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "bin/run.js");
const workspaces: string[] = [];

interface JsonEnvelope {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  data: unknown;
  error?: { message: string };
}

interface JsonCommandResult {
  envelope: JsonEnvelope;
  exitCode: number;
  stderr: string;
}

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) await cleanupWorkspace(workspace);
  }
});

describe("agent-facing JSON CLI contract", () => {
  test("lists the canonical command taxonomy in one parseable JSON document", async () => {
    const result = await runJson(["commands", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: "commands",
      data: {
        commands: expect.arrayContaining([
          "commands",
          "compress",
          "metadata strip",
          "exif",
          "deps doctor",
          "deps install",
          "doctor",
          "update check",
          "update apply",
          "help",
          "version",
        ]),
      },
      ok: true,
      schemaVersion: 1,
    });
  });

  test("puts verbose command diagnostics in JSON data instead of stderr", async () => {
    const result = await runJson(["commands", "--json", "--verbose"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.envelope).toMatchObject({
      command: "commands",
      data: {
        diagnostics: [expect.stringMatching(/^Discovered \d+ command/)],
      },
      ok: true,
    });
  });

  test("returns version metadata in the stable envelope", async () => {
    const result = await runJson(["version", "--json", "--verbose"]);

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: "version",
      data: {
        bin: "sqz",
        diagnostics: [expect.stringMatching(/^Root: /)],
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      },
      ok: true,
    });
  });

  test("exposes root and command-specific help as machine-readable data", async () => {
    const rootHelp = await runJson(["help", "--json"]);
    const commandHelp = await runJson(["help", "compress", "--json"]);

    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.envelope).toMatchObject({
      command: "help",
      data: {
        requestedCommand: null,
        commands: expect.arrayContaining(["compress", "metadata strip"]),
      },
      ok: true,
    });
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.envelope).toMatchObject({
      command: "help",
      data: { commands: ["compress"], requestedCommand: "compress" },
      ok: true,
    });
  });

  test("returns a structured error for an unknown help target", async () => {
    const result = await runJson(["help", "not-a-command", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toEqual({
      schemaVersion: 1,
      command: "help",
      ok: false,
      data: {},
      error: { message: "Unknown command: not-a-command" },
    });
  });

  test.each([
    ["compress", ["compress", "--json"]],
    ["metadata strip", ["metadata", "strip", "--json"]],
    ["exif alias", ["exif", "--json"]],
  ])("reports an empty %s run without human output", async (_label, args) => {
    const result = await runJson(args);

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: _label === "exif alias" ? "metadata strip" : _label,
      data: {
        inputs: 0,
        results: [],
        summary: {
          processed: 0,
          optimized: 0,
          dryRunEligible: 0,
          failed: 0,
          skipped: 0,
          savedBytes: 0,
        },
      },
      ok: true,
    });
  });

  test("uses JSON-only output for a dry run and never modifies the input", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const before = await hashFile(input);

    const result = await runJson(
      ["compress", input, "--dry-run", "--progress", "off", "--json"],
      { cwd: workspace }
    );

    expect(result.exitCode).toBe(0);
    expect(result.envelope.command).toBe("compress");
    expect(result.envelope.error).toBeUndefined();
    expect(await hashFile(input)).toBe(before);
    if (result.envelope.ok) {
      expect(result.envelope).toMatchObject({
        data: {
          inputs: 1,
          results: [expect.objectContaining({ status: "dry-run" })],
          summary: expect.objectContaining({ dryRunEligible: 1 }),
        },
      });
    }
  });

  test.each([
    ["compress", ["compress"]],
    ["metadata strip", ["metadata", "strip"]],
  ])(
    "requires --yes before %s can change an input in JSON mode",
    async (command, prefix) => {
      const workspace = await createWorkspace();
      const input = await copyFixtureToWorkspace(
        representativeFixtures.png,
        workspace
      );
      const before = await hashFile(input);

      const result = await runJson([...prefix, input, "--json"], {
        cwd: workspace,
      });

      expect(result.exitCode).toBe(1);
      expect(result.envelope).toEqual({
        schemaVersion: 1,
        command,
        ok: false,
        data: {},
        error: {
          message: `--yes is required for ${command} in JSON or non-interactive mode.`,
        },
      });
      expect(await hashFile(input)).toBe(before);
    }
  );

  test("keeps option-parser validation in the JSON error contract", async () => {
    const result = await runJson([
      "compress",
      "--profile",
      "invalid",
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toMatchObject({
      command: "compress",
      data: {},
      error: {
        message: expect.stringContaining("Expected --profile=invalid"),
      },
      ok: false,
      schemaVersion: 1,
    });
  });

  test("rejects incompatible profile flags without starting max compression", async () => {
    const result = await runJson([
      "compress",
      "--profile",
      "max",
      "--threshold",
      "1",
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toEqual({
      schemaVersion: 1,
      command: "compress",
      ok: false,
      data: {},
      error: { message: "--threshold cannot be used with --profile max" },
    });
  });

  test("returns scoped dependency diagnostics as JSON", async () => {
    const result = await runJson([
      "deps",
      "doctor",
      "definitely-not-an-image.png",
      "--json",
    ]);

    expect(result.envelope).toMatchObject({
      command: "deps doctor",
      data: {
        scope: "selected-inputs",
        inputs: 0,
        tools: expect.any(Array),
      },
    });
  });

  test("never installs dependencies without --yes in JSON mode", async () => {
    const result = await runJson(["deps", "install", "--json"]);

    if (result.envelope.ok) {
      expect(result.exitCode).toBe(0);
      expect(result.envelope).toMatchObject({
        command: "deps install",
        data: { installed: false },
      });
    } else {
      expect(result.exitCode).toBe(1);
      expect(result.envelope).toMatchObject({
        command: "deps install",
        error: {
          message: expect.stringContaining("--yes is required"),
        },
      });
    }
  });

  test("reports complete environment readiness in JSON with a matching exit code", async () => {
    const result = await runJson(["doctor", "--json", "--verbose"]);

    expect(result.exitCode).toBe(result.envelope.ok ? 0 : 1);
    expect(result.envelope).toMatchObject({
      command: "doctor",
      data: {
        runtime: expect.objectContaining({
          healthy: expect.any(Boolean),
          minimum: "22.13.0",
          node: expect.any(String),
        }),
        platform: expect.objectContaining({ supported: expect.any(Boolean) }),
        tools: expect.any(Array),
        diagnostics: [expect.stringMatching(/^Checked \d+ tool/)],
      },
    });
  });

  test("returns a no-side-effect Homebrew update failure as JSON", async () => {
    const result = await runJson(["update", "check", "--pm", "brew", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toMatchObject({
      command: "update check",
      data: {
        code: "BREW_NOT_FORMULA_MANAGED",
      },
      ok: false,
      schemaVersion: 1,
    });
  });

  test("requires --yes before update apply can make changes in JSON mode", async () => {
    const result = await runJson(["update", "apply", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope).toEqual({
      schemaVersion: 1,
      command: "update apply",
      ok: false,
      data: {},
      error: {
        message:
          "--yes is required for update apply in JSON or non-interactive mode.",
      },
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-cli-json-");
  workspaces.push(workspace);
  return workspace;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function runJson(
  args: string[],
  options: { cwd?: string } = {}
): Promise<JsonCommandResult> {
  const result = await execa(process.execPath, [launcher, ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    reject: false,
  });
  const stdout = result.stdout.trim();

  expect(result.stderr).toBe("");
  expect(stdout).not.toContain(String.fromCharCode(27));

  const envelope = JSON.parse(stdout) as JsonEnvelope;
  expect(envelope.schemaVersion).toBe(1);
  expect(envelope.command).toEqual(expect.any(String));
  expect(envelope.ok).toEqual(expect.any(Boolean));
  expect(envelope.data).toBeDefined();
  expect(Object.keys(envelope).sort()).toEqual(
    envelope.error
      ? ["command", "data", "error", "ok", "schemaVersion"]
      : ["command", "data", "ok", "schemaVersion"]
  );
  expect(result.exitCode ?? 1).toBe(envelope.ok ? 0 : 1);

  return {
    envelope,
    exitCode: result.exitCode ?? 1,
    stderr: result.stderr,
  };
}
