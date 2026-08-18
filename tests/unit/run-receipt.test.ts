import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { CommandMeta, SqueezitIssue } from "../../src/cli/output";
import { readRunReceipt, RunReceiptRecorder } from "../../src/cli/run-receipt";
import type { OptimizationResult, ResolvedInput } from "../../src/types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true }))
  );
});

describe("run receipts", () => {
  test("atomically checkpoints indexed input results with before and after hashes", async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, "image.png");
    const receiptPath = join(directory, "receipt.json");
    await writeFile(input, "before");

    const recorder = await RunReceiptRecorder.create({
      command: "compress",
      meta: commandMeta(),
      options: { dryRun: false, profile: "standard" },
      path: receiptPath,
      tools: [],
    });
    await recorder.prepareInputs([resolvedInput(input)]);
    await recorder.inputStarted(0);
    await writeFile(input, "after");
    await recorder.inputCompleted(0, optimizationResult(input));
    await recorder.finalize({
      data: { inputs: 1 },
      exitCode: 0,
      ok: true,
    });

    const receipt = await readRunReceipt(receiptPath);
    expect(receipt).toMatchObject({
      command: "compress",
      elapsedMs: expect.any(Number),
      receiptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      status: "completed",
      terminal: { exitCode: 0, ok: true },
      inputs: [
        {
          index: 0,
          path: input,
          state: "optimized",
          before: { digest: expect.any(String), size: 6 },
          after: {
            path: input,
            fingerprint: { digest: expect.any(String), size: 5 },
          },
        },
      ],
    });
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(receipt);
  });

  test("refuses to replace an existing receipt artifact", async () => {
    const directory = await temporaryDirectory();
    const receiptPath = join(directory, "receipt.json");
    await writeFile(receiptPath, "existing");

    await expect(
      RunReceiptRecorder.create({
        command: "doctor",
        meta: commandMeta(),
        options: {},
        path: receiptPath,
        tools: [],
      })
    ).rejects.toMatchObject({ code: "RECEIPT_OUTPUT_EXISTS" });
  });

  test("checkpoints a non-mutating observed input with its post-run fingerprint", async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, "input.png");
    const receiptPath = join(directory, "receipt.json");
    await writeFile(input, "unchanged");

    const recorder = await RunReceiptRecorder.create({
      command: "plan compress",
      meta: commandMeta(),
      options: {},
      path: receiptPath,
      tools: [],
    });
    await recorder.prepareInputs([resolvedInput(input)]);
    await recorder.inputStarted(0);
    await recorder.inputObserved(0);
    await recorder.finalize({ data: {}, exitCode: 0, ok: true });

    await expect(readRunReceipt(receiptPath)).resolves.toMatchObject({
      inputs: [
        expect.objectContaining({
          after: expect.objectContaining({ fingerprint: expect.any(Object) }),
          state: "observed",
        }),
      ],
    });
  });

  test("rejects a modified receipt digest with a typed error", async () => {
    const directory = await temporaryDirectory();
    const receiptPath = join(directory, "receipt.json");
    const recorder = await RunReceiptRecorder.create({
      command: "doctor",
      meta: commandMeta(),
      options: {},
      path: receiptPath,
      tools: [],
    });
    await recorder.finalize({ data: {}, exitCode: 0, ok: true });

    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<
      string,
      unknown
    >;
    receipt.command = "update apply";
    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`);

    await expect(readRunReceipt(receiptPath)).rejects.toMatchObject({
      code: "RECEIPT_INVALID",
    } satisfies Partial<SqueezitIssue>);
  });
});

function commandMeta(): CommandMeta {
  return {
    cwd: "/workspace",
    executablePath: "/workspace/bin/run.js",
    invocationPath: "/workspace/bin/sqz",
    nodeVersion: "24.16.0",
    packageRoot: "/workspace",
    platform: "darwin-arm64",
    squeezitVersion: "2.2.0",
  };
}

function optimizationResult(path: string): OptimizationResult {
  return {
    filePath: path,
    label: "[PNG]",
    optimizedSize: 5,
    originalSize: 6,
    savedBytes: 1,
    status: "optimized",
    targetPath: path,
  };
}

function resolvedInput(path: string): ResolvedInput {
  return { absolutePath: path, displayPath: "image.png" };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-receipt-"));
  temporaryDirectories.push(directory);
  return directory;
}
