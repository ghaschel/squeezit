import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, test } from "vitest";

import { receiptOptions } from "../../src/cli/commands/compress";
import { readRunReceipt, RunReceiptRecorder } from "../../src/cli/run-receipt";
import {
  collectRequiredDependencies,
  diagnoseDependencies,
  resolveCompressOptions,
} from "../../src/utils";
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
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) await cleanupWorkspace(workspace);
  }
});

describe("CLI run receipts", () => {
  test("records a dry-run compression command and exposes its receipt summary in JSON", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const receiptPath = join(workspace, "receipts", "compress.json");

    const result = await execa(
      process.execPath,
      [
        launcher,
        "compress",
        input,
        "--dry-run",
        "--progress",
        "off",
        "--receipt",
        receiptPath,
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout) as {
      data: { receipt: { path: string; status: string } };
    };
    expect(envelope.data.receipt).toMatchObject({
      path: receiptPath,
      status: "completed",
    });

    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      command: string;
      inputs: Array<{ after: unknown; before: unknown; state: string }>;
      status: string;
      terminal: { exitCode: number; ok: boolean };
    };
    expect(receipt).toMatchObject({
      command: "compress",
      status: "completed",
      terminal: { exitCode: 0, ok: true },
    });
    expect(receipt.inputs).toEqual([
      expect.objectContaining({
        after: expect.any(Object),
        before: expect.any(Object),
        state: "dry-run",
      }),
    ]);
  });

  test("requires explicit approval before attempting a receipt resume", async () => {
    const workspace = await createWorkspace();
    const result = await execa(
      process.execPath,
      [
        launcher,
        "receipt",
        "resume",
        join(workspace, "source.json"),
        "--output",
        join(workspace, "resumed.json"),
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "receipt resume",
      error: { code: "CONFIRMATION_REQUIRED" },
      ok: false,
    });
  });

  test("refuses an existing receipt output path without modifying it", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const receiptPath = join(workspace, "existing.json");
    await writeFile(receiptPath, "preserve this artifact");

    const result = await execa(
      process.execPath,
      [
        launcher,
        "compress",
        input,
        "--dry-run",
        "--receipt",
        receiptPath,
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "RECEIPT_OUTPUT_EXISTS" },
      ok: false,
    });
    await expect(readFile(receiptPath, "utf8")).resolves.toBe(
      "preserve this artifact"
    );
  });

  test("adds the receipt summary to the JSON Lines terminal event", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const receiptPath = join(workspace, "events.json");

    const result = await execa(
      process.execPath,
      [
        launcher,
        "compress",
        input,
        "--dry-run",
        "--receipt",
        receiptPath,
        "--events",
        "jsonl",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(0);
    const terminal = JSON.parse(
      result.stdout.trim().split("\n").at(-1) ?? "{}"
    ) as { data: { receipt: { path: string; status: string } } };
    expect(terminal.data.receipt).toMatchObject({
      path: receiptPath,
      status: "completed",
    });
  });

  test("resumes only a failed receipt input into a linked receipt", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const sourcePath = join(workspace, "source.json");
    const outputPath = join(workspace, "resumed.json");
    await createFailedDryRunReceipt(workspace, input, sourcePath);

    const result = await execa(
      process.execPath,
      [
        launcher,
        "receipt",
        "resume",
        sourcePath,
        "--output",
        outputPath,
        "--yes",
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "receipt resume",
      data: {
        receipt: { path: outputPath, status: "completed" },
        report: { summary: { dryRunEligible: 1 } },
      },
      ok: true,
    });
    await expect(readRunReceipt(outputPath)).resolves.toMatchObject({
      operation: "compress",
      resumedFrom: expect.objectContaining({ path: sourcePath }),
      inputs: [expect.objectContaining({ index: 0, state: "dry-run" })],
    });
  });

  test("rejects a changed retry input before creating a resumed receipt", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const sourcePath = join(workspace, "source.json");
    const outputPath = join(workspace, "resumed.json");
    await createFailedDryRunReceipt(workspace, input, sourcePath);
    await writeFile(input, "changed after the receipt was finalized");

    const result = await execa(
      process.execPath,
      [
        launcher,
        "receipt",
        "resume",
        sourcePath,
        "--output",
        outputPath,
        "--yes",
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "RECEIPT_INPUT_CHANGED" },
      ok: false,
    });
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("rejects a receipt from a different Squeezit runtime before creating output", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const sourcePath = join(workspace, "source.json");
    const outputPath = join(workspace, "resumed.json");
    await createFailedDryRunReceipt(workspace, input, sourcePath, {
      squeezitVersion: "0.0.0",
    });

    const result = await execa(
      process.execPath,
      [
        launcher,
        "receipt",
        "resume",
        sourcePath,
        "--output",
        outputPath,
        "--yes",
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "RECEIPT_RUNTIME_CHANGED" },
      ok: false,
    });
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("writes a failed linked receipt when recorded tools cannot be verified", async () => {
    const workspace = await createWorkspace();
    const input = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const sourcePath = join(workspace, "source.json");
    const outputPath = join(workspace, "resumed.json");
    await createFailedDryRunReceipt(workspace, input, sourcePath, {
      tools: [],
    });

    const result = await execa(
      process.execPath,
      [
        launcher,
        "receipt",
        "resume",
        sourcePath,
        "--output",
        outputPath,
        "--yes",
        "--json",
      ],
      { cwd: workspace, reject: false }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: { receipt: { path: outputPath, status: "failed" } },
      error: { code: "RECEIPT_TOOL_CHANGED" },
      ok: false,
    });
    await expect(readRunReceipt(outputPath)).resolves.toMatchObject({
      status: "failed",
      terminal: { error: { code: "RECEIPT_TOOL_CHANGED" } },
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace();
  workspaces.push(workspace);
  return workspace;
}

async function createFailedDryRunReceipt(
  workspace: string,
  input: string,
  sourcePath: string,
  overrides: { squeezitVersion?: string; tools?: [] } = {}
): Promise<void> {
  const options = resolveCompressOptions(
    [input],
    { dryRun: true, progress: "off" },
    workspace
  );
  const tools = await diagnoseDependencies(
    collectRequiredDependencies(
      [{ absolutePath: input, displayPath: "input.png" }],
      options
    )
  );
  const packageMetadata = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  ) as { version: string };
  const source = await RunReceiptRecorder.create({
    command: "compress",
    meta: {
      cwd: workspace,
      executablePath: launcher,
      invocationPath: launcher,
      nodeVersion: process.versions.node,
      packageRoot: root,
      platform: `${process.platform}-${process.arch}`,
      squeezitVersion: overrides.squeezitVersion ?? packageMetadata.version,
    },
    options: receiptOptions(options),
    path: sourcePath,
    tools: overrides.tools ?? tools,
  });
  await source.prepareInputs([
    { absolutePath: input, displayPath: "input.png" },
  ]);
  await source.inputStarted(0);
  await source.inputCompleted(0, {
    filePath: input,
    label: "[PNG]",
    optimizedSize: 0,
    originalSize: 0,
    savedBytes: 0,
    status: "failed",
    targetPath: input,
  });
  await source.finalize({ data: {}, exitCode: 1, ok: false });
}
