import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => cleanupWorkspace(workspace))
  );
});

describe("CLI plan/apply workflow", () => {
  test("creates a schema-valid lightweight plan without changing the source image", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "plans", "compress.json");
    const before = await hashFile(input);

    const result = await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: "plan compress",
      data: {
        output: { path: output },
        plan: {
          kind: "squeezit-optimization-plan",
          operation: "compress",
          planDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          inputs: [
            expect.objectContaining({
              path: input,
              fingerprint: expect.objectContaining({ algorithm: "sha256" }),
            }),
          ],
          tools: expect.any(Array),
        },
      },
      ok: true,
      schemaVersion: 2,
    });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(
      result.envelope.data.plan
    );
    expect(await hashFile(input)).toBe(before);
  });

  test("applies a valid reviewed plan through the shared optimizer runner", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "compress.json");
    const planned = await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );
    const planDigest = planned.envelope.data.plan?.planDigest;
    if (!planDigest)
      throw new Error("Expected plan creation to return a digest.");

    const applied = await runJson(
      ["plan", "apply", output, "--yes", "--progress", "off", "--json"],
      workspace
    );

    expect(applied.exitCode).toBe(0);
    expect(applied.envelope).toMatchObject({
      command: "plan apply",
      data: {
        plan: { planDigest },
        report: {
          inputs: 1,
          results: [expect.objectContaining({ filePath: input })],
          summary: expect.objectContaining({ processed: 1 }),
        },
      },
      ok: true,
    });
  });

  test("requires final --yes and rejects changed inputs before image writes", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "compress.json");
    await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );

    const missingApproval = await runJson(
      ["plan", "apply", output, "--json"],
      workspace
    );
    expect(missingApproval).toMatchObject({
      exitCode: 1,
      envelope: {
        error: { code: "CONFIRMATION_REQUIRED" },
        ok: false,
      },
    });

    await writeFile(input, "changed after review");
    const changedInput = await runJson(
      ["plan", "apply", output, "--yes", "--json"],
      workspace
    );

    expect(changedInput).toMatchObject({
      exitCode: 1,
      envelope: {
        error: { code: "PLAN_INPUT_CHANGED", details: { paths: [input] } },
        ok: false,
      },
    });
    expect(await readFile(input, "utf8")).toBe("changed after review");
  });

  test("creates equivalent metadata plans through the canonical and exif paths", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const canonicalOutput = join(workspace, "metadata.json");
    const aliasOutput = join(workspace, "exif.json");

    const [canonical, alias] = await Promise.all([
      runJson(
        [
          "plan",
          "metadata",
          "strip",
          input,
          "--output",
          canonicalOutput,
          "--json",
        ],
        workspace
      ),
      runJson(
        ["plan", "exif", input, "--output", aliasOutput, "--json"],
        workspace
      ),
    ]);

    expect(canonical.envelope.data.plan).toMatchObject({
      operation: "metadata strip",
      options: { exifOnly: true },
    });
    expect(alias.envelope.data.plan).toMatchObject({
      operation: "metadata strip",
      options: { exifOnly: true },
    });
  });

  test("returns typed errors for an existing output and invalid reviewed artifact", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "compress.json");
    await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );

    const existingOutput = await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );
    expect(existingOutput).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "PLAN_OUTPUT_EXISTS" }, ok: false },
    });

    await writeFile(output, "not a plan");
    const invalidPlan = await runJson(
      ["plan", "apply", output, "--yes", "--json"],
      workspace
    );
    expect(invalidPlan).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "PLAN_INVALID" }, ok: false },
    });
  });

  test("rejects reviewed artifacts whose runtime or optimizer version changed", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "compress.json");
    await runJson(
      ["plan", "compress", input, "--output", output, "--json"],
      workspace
    );
    const artifact = (await readJson(output)) as PlanArtifact;
    const originalVersion = artifact.runtime.squeezitVersion;

    artifact.runtime.squeezitVersion = "99.99.99";
    await writeFile(output, `${JSON.stringify(withDigest(artifact))}\n`);
    const changedRuntime = await runJson(
      ["plan", "apply", output, "--yes", "--json"],
      workspace
    );
    expect(changedRuntime).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "PLAN_RUNTIME_CHANGED" }, ok: false },
    });

    const changedToolArtifact = (await readJson(output)) as PlanArtifact;
    changedToolArtifact.runtime.squeezitVersion = originalVersion;
    const [tool] = changedToolArtifact.tools;
    if (!tool) throw new Error("Expected a PNG plan to require an optimizer.");
    tool.normalizedVersion = "99.99.99";
    await writeFile(
      output,
      `${JSON.stringify(withDigest(changedToolArtifact))}\n`
    );
    const changedTool = await runJson(
      ["plan", "apply", output, "--yes", "--json"],
      workspace
    );
    expect(changedTool).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "PLAN_TOOL_CHANGED" }, ok: false },
    });
  });

  test("rejects execution-only plan creation flags and apply overrides", async () => {
    const workspace = await createWorkspace();
    const planCreation = await runJson(
      [
        "plan",
        "compress",
        "--output",
        join(workspace, "plan.json"),
        "--dry-run",
        "--json",
      ],
      workspace
    );
    const planApply = await runJson(
      ["plan", "apply", "missing.json", "--yes", "--profile", "max", "--json"],
      workspace
    );

    expect(planCreation).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "VALIDATION_ERROR" }, ok: false },
    });
    expect(planApply).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: "VALIDATION_ERROR" }, ok: false },
    });
  });

  test("rejects explicit unsupported inputs before writing an artifact", async () => {
    const workspace = await createWorkspace();
    const unsupported = join(workspace, "notes.txt");
    const output = join(workspace, "plans", "compress.json");
    await writeFile(unsupported, "not an image");

    const result = await runJson(
      ["plan", "compress", unsupported, "--output", output, "--json"],
      workspace
    );

    expect(result).toMatchObject({
      exitCode: 1,
      envelope: {
        error: {
          code: "UNSUPPORTED_FORMAT",
          details: { paths: [unsupported] },
        },
        ok: false,
      },
    });
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-cli-plan-");
  workspaces.push(workspace);
  return workspace;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

interface PlanArtifact {
  planDigest: string;
  runtime: { squeezitVersion: string };
  tools: Array<{ normalizedVersion: string }>;
  [key: string]: unknown;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function withDigest(plan: PlanArtifact): PlanArtifact {
  const { planDigest: _planDigest, ...unsignedPlan } = plan;
  return {
    ...unsignedPlan,
    planDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(canonicalize(unsignedPlan)))
      .digest("hex")}`,
  } as PlanArtifact;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
  );
}

async function runJson(
  args: string[],
  cwd: string
): Promise<{
  envelope: {
    command: string;
    data: {
      plan?: { planDigest: string };
      [key: string]: unknown;
    };
    error?: { code: string; details?: Record<string, unknown> };
    ok: boolean;
    schemaVersion: number;
  };
  exitCode: number;
}> {
  const result = await execa(process.execPath, [launcher, ...args], {
    cwd,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    reject: false,
  });

  expect(result.stderr).toBe("");
  const envelope = JSON.parse(result.stdout) as {
    command: string;
    data: {
      plan?: { planDigest: string };
      [key: string]: unknown;
    };
    error?: { code: string; details?: Record<string, unknown> };
    ok: boolean;
    schemaVersion: number;
  };
  expect(result.exitCode ?? 1).toBe(envelope.ok ? 0 : 1);

  return { envelope, exitCode: result.exitCode ?? 1 };
}
