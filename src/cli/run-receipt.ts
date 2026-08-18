import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { DependencyDiagnostic } from "../core/dependencies";
import type { OptimizationResult, ResolvedInput } from "../types";
import type { PlanFingerprint } from "./optimization-plan";
import type { CommandMeta, SqueezitIssue } from "./output";
import { SqueezitError } from "./output";

const RECEIPT_KIND = "squeezit-run-receipt";
const RECEIPT_SCHEMA_VERSION = 1;

export type RunReceiptInputState =
  | "dry-run"
  | "failed"
  | "observed"
  | "optimized"
  | "pending"
  | "running"
  | "skipped";

export type RunReceiptStatus = "completed" | "failed" | "running";

export interface RunReceiptInput {
  after?: { fingerprint: PlanFingerprint; path: string };
  before: PlanFingerprint;
  completedAt?: string;
  displayPath: string;
  index: number;
  path: string;
  result?: OptimizationResult;
  startedAt?: string;
  state: RunReceiptInputState;
}

export interface RunReceiptTerminal {
  data: Record<string, unknown>;
  error?: SqueezitIssue;
  exitCode: number;
  ok: boolean;
}

export interface RunReceipt {
  command: string;
  completedAt?: string;
  createdAt: string;
  elapsedMs?: number;
  inputs: RunReceiptInput[];
  kind: typeof RECEIPT_KIND;
  meta: CommandMeta;
  operation: string;
  options: Record<string, unknown>;
  outputs: Array<{ fingerprint: PlanFingerprint; path: string }>;
  receiptDigest: string;
  receiptId: string;
  resumedFrom?: { path: string; receiptDigest: string; receiptId: string };
  schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  startedAt: string;
  status: RunReceiptStatus;
  terminal?: RunReceiptTerminal;
  tools: {
    after?: DependencyDiagnostic[];
    before: DependencyDiagnostic[];
  };
}

export interface ReceiptSummary {
  path: string;
  receiptDigest: string;
  receiptId: string;
  status: RunReceiptStatus;
}

export class RunReceiptRecorder {
  readonly path: string;

  private checkpointQueue: Promise<void> = Promise.resolve();
  private failure?: SqueezitError;
  private readonly startedAtMs: number;
  private receipt: RunReceipt;

  private constructor(path: string, receipt: RunReceipt, startedAtMs: number) {
    this.path = path;
    this.receipt = receipt;
    this.startedAtMs = startedAtMs;
  }

  static async create(params: {
    command: string;
    meta: CommandMeta;
    options: Record<string, unknown>;
    operation?: string;
    path: string;
    resumedFrom?: RunReceipt["resumedFrom"];
    tools: DependencyDiagnostic[];
  }): Promise<RunReceiptRecorder> {
    const startedAt = new Date();
    const receipt = withDigest({
      command: params.command,
      createdAt: startedAt.toISOString(),
      inputs: [],
      kind: RECEIPT_KIND,
      meta: params.meta,
      operation: params.operation ?? params.command,
      options: params.options,
      outputs: [],
      receiptId: randomUUID(),
      ...(params.resumedFrom ? { resumedFrom: params.resumedFrom } : {}),
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      startedAt: startedAt.toISOString(),
      status: "running",
      tools: { before: params.tools },
    });
    const path = resolve(params.path);
    await writeReceiptWithoutOverwrite(path, receipt);
    return new RunReceiptRecorder(path, receipt, startedAt.getTime());
  }

  async addOutput(path: string): Promise<void> {
    this.assertWritable();
    this.receipt.outputs.push({
      fingerprint: await fingerprint(path),
      path: resolve(path),
    });
    await this.checkpoint();
  }

  async finalize(params: {
    data: Record<string, unknown>;
    error?: SqueezitIssue;
    exitCode: number;
    ok: boolean;
  }): Promise<ReceiptSummary> {
    this.assertWritable();
    this.receipt.completedAt = new Date().toISOString();
    this.receipt.elapsedMs = Date.now() - this.startedAtMs;
    this.receipt.status = "completed";
    this.receipt.terminal = {
      data: params.data,
      ...(params.error ? { error: params.error } : {}),
      exitCode: params.exitCode,
      ok: params.ok,
    };
    await this.checkpoint();
    return this.summary();
  }

  async fail(
    error: SqueezitIssue,
    data: Record<string, unknown> = {}
  ): Promise<ReceiptSummary> {
    this.assertWritable();
    this.receipt.completedAt = new Date().toISOString();
    this.receipt.elapsedMs = Date.now() - this.startedAtMs;
    this.receipt.status = "failed";
    this.receipt.terminal = { data, error, exitCode: 1, ok: false };
    await this.checkpoint();
    return this.summary();
  }

  async inputCompleted(
    index: number,
    result: OptimizationResult
  ): Promise<void> {
    this.assertWritable();
    const input = this.inputAt(index);
    const targetPath = resolve(result.targetPath ?? result.filePath);
    const observedPath = await lstat(targetPath)
      .then((stats) => (stats.isFile() ? targetPath : input.path))
      .catch(() => input.path);
    input.after = {
      fingerprint: await fingerprint(observedPath),
      path: observedPath,
    };
    input.completedAt = new Date().toISOString();
    input.result = result;
    input.state = result.status;
    await this.checkpoint();
  }

  async inputStarted(index: number): Promise<void> {
    this.assertWritable();
    const input = this.inputAt(index);
    input.startedAt = new Date().toISOString();
    input.state = "running";
    await this.checkpoint();
  }

  async inputObserved(index: number): Promise<void> {
    this.assertWritable();
    const input = this.inputAt(index);
    input.after = {
      fingerprint: await fingerprint(input.path),
      path: input.path,
    };
    input.completedAt = new Date().toISOString();
    input.state = "observed";
    await this.checkpoint();
  }

  async prepareInputs(
    inputs: ResolvedInput[],
    indexes = inputs.map((_input, index) => index)
  ): Promise<void> {
    this.assertWritable();
    if (indexes.length !== inputs.length) {
      throw new SqueezitError({
        code: "RECEIPT_INVALID",
        details: { indexes: indexes.length, inputs: inputs.length },
        message: "Receipt input indexes do not match the resolved inputs.",
        remediation: "Create a new receipt with the current Squeezit CLI.",
      });
    }
    this.receipt.inputs = await Promise.all(
      inputs.map(async (input, index) => ({
        before: await fingerprint(input.absolutePath),
        displayPath: input.displayPath,
        index: indexes[index] ?? index,
        path: input.absolutePath,
        state: "pending" as const,
      }))
    );
    await this.checkpoint();
  }

  async setToolsBefore(tools: DependencyDiagnostic[]): Promise<void> {
    this.assertWritable();
    this.receipt.tools.before = tools;
    await this.checkpoint();
  }

  async setOptions(options: Record<string, unknown>): Promise<void> {
    this.assertWritable();
    this.receipt.options = options;
    await this.checkpoint();
  }

  async setToolsAfter(tools: DependencyDiagnostic[]): Promise<void> {
    this.assertWritable();
    this.receipt.tools.after = tools;
    await this.checkpoint();
  }

  summary(): ReceiptSummary {
    return {
      path: this.path,
      receiptDigest: this.receipt.receiptDigest,
      receiptId: this.receipt.receiptId,
      status: this.receipt.status,
    };
  }

  private assertWritable(): void {
    if (this.failure) throw this.failure;
  }

  private async checkpoint(): Promise<void> {
    this.receipt = withDigest(withoutDigest(this.receipt));
    this.checkpointQueue = this.checkpointQueue.then(() =>
      replaceReceiptAtomically(this.path, this.receipt)
    );

    try {
      await this.checkpointQueue;
    } catch {
      this.failure = new SqueezitError({
        code: "RECEIPT_WRITE_FAILED",
        details: { path: this.path },
        message: `Unable to checkpoint run receipt: ${this.path}`,
        remediation:
          "Fix the receipt output path or its filesystem permissions before retrying the operation.",
      });
      throw this.failure;
    }
  }

  private inputAt(index: number): RunReceiptInput {
    const input = this.receipt.inputs.find(
      (candidate) => candidate.index === index
    );
    if (!input) {
      throw new SqueezitError({
        code: "RECEIPT_INVALID",
        details: { index, path: this.path },
        message: "Receipt input lifecycle referenced an unknown input index.",
        remediation: "Create a new receipt with the current Squeezit version.",
      });
    }
    return input;
  }
}

export async function readRunReceipt(path: string): Promise<RunReceipt> {
  const receiptPath = resolve(path);
  try {
    const value = JSON.parse(await readFile(receiptPath, "utf8"));
    if (
      !isRunReceipt(value) ||
      value.receiptDigest !== digest(withoutDigest(value))
    ) {
      throw new Error("invalid receipt");
    }
    return value;
  } catch {
    throw new SqueezitError({
      code: "RECEIPT_INVALID",
      details: { path: receiptPath },
      message: `Unable to read a valid Squeezit receipt from ${receiptPath}.`,
      remediation:
        "Use an unmodified receipt created by the current Squeezit CLI.",
    });
  }
}

export async function fingerprintRunReceiptFile(
  path: string
): Promise<PlanFingerprint> {
  return fingerprint(path);
}

export function fingerprintsMatch(
  left: PlanFingerprint,
  right: PlanFingerprint
): boolean {
  return (
    left.algorithm === right.algorithm &&
    left.digest === right.digest &&
    left.size === right.size
  );
}

function digest(receipt: Omit<RunReceipt, "receiptDigest">): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(receipt)))
    .digest("hex")}`;
}

async function fingerprint(path: string): Promise<PlanFingerprint> {
  const stats = await lstat(path);
  if (!stats.isFile())
    throw new Error(`Receipt target is not a regular file: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { algorithm: "sha256", digest: hash.digest("hex"), size: stats.size };
}

function withDigest(receipt: Omit<RunReceipt, "receiptDigest">): RunReceipt {
  return { ...receipt, receiptDigest: digest(receipt) };
}

function withoutDigest(receipt: RunReceipt): Omit<RunReceipt, "receiptDigest"> {
  const { receiptDigest: _receiptDigest, ...withoutReceiptDigest } = receipt;
  return withoutReceiptDigest;
}

async function writeReceiptWithoutOverwrite(
  path: string,
  receipt: RunReceipt
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = temporaryPath(path);
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  try {
    await link(temporary, path);
  } catch (error) {
    if (isNodeError(error, "EEXIST")) throw receiptOutputExists(path);
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function replaceReceiptAtomically(
  path: string,
  receipt: RunReceipt
): Promise<void> {
  const temporary = temporaryPath(path);
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)])
  );
}

function isNodeError(
  value: unknown,
  code: string
): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value && value.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRunReceipt(value: unknown): value is RunReceipt {
  return (
    isRecord(value) &&
    value.kind === RECEIPT_KIND &&
    value.schemaVersion === RECEIPT_SCHEMA_VERSION &&
    typeof value.command === "string" &&
    typeof value.operation === "string" &&
    typeof value.receiptId === "string" &&
    typeof value.receiptDigest === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.startedAt === "string" &&
    (value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed") &&
    isRecord(value.meta) &&
    isRecord(value.options) &&
    Array.isArray(value.inputs) &&
    Array.isArray(value.outputs) &&
    isRecord(value.tools)
  );
}

function receiptOutputExists(path: string): SqueezitError {
  return new SqueezitError({
    code: "RECEIPT_OUTPUT_EXISTS",
    details: { path },
    message: `Receipt output already exists: ${path}`,
    remediation:
      "Choose a new --receipt path or preserve the existing receipt for audit.",
  });
}

function temporaryPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
}
