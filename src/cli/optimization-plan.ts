import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  collectRequiredDependencies,
  type DependencyDiagnostic,
  type DependencyProvider,
  diagnoseDependencies,
} from "../core/dependencies";
import type { CoreOptimizationOptions, ResolvedInput } from "../types";
import { SqueezitError } from "./output";

const PLAN_KIND = "squeezit-optimization-plan";
const PLAN_SCHEMA_VERSION = 1;

export type OptimizationPlanOperation = "compress" | "metadata strip";

export interface PlanFingerprint {
  algorithm: "sha256";
  digest: string;
  size: number;
}

export interface PlanInput {
  displayPath: string;
  fingerprint: PlanFingerprint;
  path: string;
}

export interface PlanToolSnapshot {
  binary: string;
  minimumVersion: string;
  normalizedVersion: string;
  provider: DependencyProvider;
  rawVersion: string;
}

export interface PlanRuntimeSnapshot {
  cwd: string;
  nodeVersion: string;
  platform: string;
  squeezitVersion: string;
}

export interface PlanOptimizationOptions {
  concurrency: number;
  exifOnly: boolean;
  inPlace: boolean;
  keepTime: boolean;
  max: boolean;
  stripMeta: boolean;
  threshold: number;
}

export interface OptimizationPlan {
  createdAt: string;
  inputs: PlanInput[];
  kind: typeof PLAN_KIND;
  operation: OptimizationPlanOperation;
  options: PlanOptimizationOptions;
  planDigest: string;
  runtime: PlanRuntimeSnapshot;
  schemaVersion: typeof PLAN_SCHEMA_VERSION;
  tools: PlanToolSnapshot[];
}

export async function createOptimizationPlan(params: {
  createdAt?: string;
  inputs: ResolvedInput[];
  operation: OptimizationPlanOperation;
  options: PlanOptimizationOptions;
  runtime: PlanRuntimeSnapshot;
  tools: PlanToolSnapshot[];
}): Promise<OptimizationPlan> {
  const plan = {
    createdAt: params.createdAt ?? new Date().toISOString(),
    inputs: await Promise.all(
      params.inputs.map(async (input) => ({
        displayPath: input.displayPath,
        fingerprint: await fingerprintFile(input.absolutePath),
        path: input.absolutePath,
      }))
    ),
    kind: PLAN_KIND,
    operation: params.operation,
    options: params.options,
    runtime: params.runtime,
    schemaVersion: PLAN_SCHEMA_VERSION,
    tools: [...params.tools].sort((left, right) =>
      left.binary.localeCompare(right.binary)
    ),
  } satisfies Omit<OptimizationPlan, "planDigest">;

  return { ...plan, planDigest: planDigest(plan) };
}

export async function snapshotPlanTools(
  inputs: ResolvedInput[],
  options: CoreOptimizationOptions,
  requireHealthy: boolean
): Promise<PlanToolSnapshot[]> {
  if (inputs.length === 0) return [];

  const diagnostics = await diagnoseDependencies(
    collectRequiredDependencies(inputs, options)
  );
  const unhealthy = diagnostics.filter(
    (diagnostic) => diagnostic.status !== "healthy"
  );
  if (requireHealthy && unhealthy.length > 0) {
    throw new SqueezitError({
      code: "DEPENDENCY_MISSING",
      details: { tools: unhealthy },
      message:
        "The optimizer environment is not healthy enough to create a plan.",
      remediation:
        "Install or update the reported tools with sqz deps install, then create a new plan.",
    });
  }

  return diagnostics.map(toPlanToolSnapshot);
}

export async function fingerprintFile(path: string): Promise<PlanFingerprint> {
  const stats = await lstat(path);
  if (!stats.isFile()) {
    throw new Error(`Plan input is not a regular file: ${path}`);
  }

  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);

  return {
    algorithm: "sha256",
    digest: hash.digest("hex"),
    size: stats.size,
  };
}

export async function writeOptimizationPlan(
  path: string,
  plan: OptimizationPlan
): Promise<string> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  if (
    await lstat(output)
      .then(() => true)
      .catch(() => false)
  ) {
    throw planOutputExists(output);
  }

  const temporary = join(
    dirname(output),
    `.${basename(output)}.${randomUUID()}.tmp`
  );
  await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  try {
    await link(temporary, output);
  } catch (error) {
    if (isNodeError(error, "EEXIST")) throw planOutputExists(output);
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  return output;
}

export async function readOptimizationPlan(
  path: string
): Promise<OptimizationPlan> {
  const planPath = resolve(path);
  try {
    return parseOptimizationPlan(JSON.parse(await readFile(planPath, "utf8")));
  } catch (error) {
    if (error instanceof SqueezitError) throw error;
    throw new SqueezitError({
      code: "PLAN_INVALID",
      details: { path: planPath },
      message: `Unable to read a valid Squeezit plan from ${planPath}.`,
      remediation:
        "Create a new plan with sqz plan compress or sqz plan metadata strip.",
    });
  }
}

export async function verifyOptimizationPlan(params: {
  plan: OptimizationPlan;
  runtime: PlanRuntimeSnapshot;
  tools: PlanToolSnapshot[];
}): Promise<ResolvedInput[]> {
  const runtimeDifferences = runtimeDifferencesFor(
    params.plan.runtime,
    params.runtime
  );
  if (runtimeDifferences.length > 0) {
    throw new SqueezitError({
      code: "PLAN_RUNTIME_CHANGED",
      details: { differences: runtimeDifferences },
      message: "The Squeezit runtime no longer matches this plan.",
      remediation:
        "Create and review a new plan in the current Squeezit environment.",
    });
  }

  const toolDifferences = toolDifferencesFor(params.plan.tools, params.tools);
  if (toolDifferences.length > 0) {
    throw new SqueezitError({
      code: "PLAN_TOOL_CHANGED",
      details: { differences: toolDifferences },
      message: "The optimizer toolchain no longer matches this plan.",
      remediation:
        "Create and review a new plan after restoring the expected optimizer versions.",
    });
  }

  const mismatches = (
    await Promise.all(params.plan.inputs.map(inputMismatchFor))
  ).filter(
    (mismatch): mismatch is Record<string, unknown> => mismatch !== undefined
  );

  if (mismatches.length > 0) {
    throw planInputChanged(mismatches);
  }

  return params.plan.inputs.map((input) => ({
    absolutePath: input.path,
    displayPath: input.displayPath,
  }));
}

export async function verifyPlanInput(input: PlanInput): Promise<void> {
  const mismatch = await inputMismatchFor(input);
  if (mismatch) throw planInputChanged([mismatch]);
}

export function parseOptimizationPlan(value: unknown): OptimizationPlan {
  if (
    !isOptimizationPlan(value) ||
    value.planDigest !== planDigest(withoutDigest(value))
  ) {
    throw new SqueezitError({
      code: "PLAN_INVALID",
      message:
        "The plan artifact is malformed, unsupported, or has been modified.",
      remediation:
        "Create a new plan with the current Squeezit CLI before applying changes.",
    });
  }

  return value;
}

function withoutDigest(
  plan: OptimizationPlan
): Omit<OptimizationPlan, "planDigest"> {
  const { planDigest: _planDigest, ...withoutPlanDigest } = plan;
  return withoutPlanDigest;
}

function planDigest(plan: Omit<OptimizationPlan, "planDigest">): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
  );
}

function isOptimizationPlan(value: unknown): value is OptimizationPlan {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== PLAN_SCHEMA_VERSION ||
    value.kind !== PLAN_KIND ||
    (value.operation !== "compress" && value.operation !== "metadata strip") ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.planDigest !== "string" ||
    !isPlanOptions(value.options) ||
    !isOperationCompatibleWithOptions(value.operation, value.options) ||
    !isRuntimeSnapshot(value.runtime) ||
    !Array.isArray(value.inputs) ||
    !value.inputs.every(isPlanInput) ||
    !Array.isArray(value.tools) ||
    !value.tools.every(isPlanToolSnapshot)
  ) {
    return false;
  }

  return true;
}

function isOperationCompatibleWithOptions(
  operation: OptimizationPlanOperation,
  options: PlanOptimizationOptions
): boolean {
  if (operation === "metadata strip") return options.exifOnly;
  return !options.exifOnly && (!options.max || options.threshold === 0);
}

function isPlanOptions(value: unknown): value is PlanOptimizationOptions {
  return (
    isRecord(value) &&
    isPositiveInteger(value.concurrency) &&
    typeof value.exifOnly === "boolean" &&
    typeof value.inPlace === "boolean" &&
    typeof value.keepTime === "boolean" &&
    typeof value.max === "boolean" &&
    typeof value.stripMeta === "boolean" &&
    typeof value.threshold === "number" &&
    value.threshold >= 0
  );
}

function isRuntimeSnapshot(value: unknown): value is PlanRuntimeSnapshot {
  return (
    isRecord(value) &&
    typeof value.cwd === "string" &&
    typeof value.nodeVersion === "string" &&
    typeof value.platform === "string" &&
    typeof value.squeezitVersion === "string"
  );
}

function isPlanInput(value: unknown): value is PlanInput {
  return (
    isRecord(value) &&
    typeof value.displayPath === "string" &&
    typeof value.path === "string" &&
    isAbsolute(value.path) &&
    isFingerprint(value.fingerprint)
  );
}

function isFingerprint(value: unknown): value is PlanFingerprint {
  return (
    isRecord(value) &&
    value.algorithm === "sha256" &&
    typeof value.digest === "string" &&
    /^[a-f0-9]{64}$/.test(value.digest) &&
    typeof value.size === "number" &&
    value.size >= 0
  );
}

function isPlanToolSnapshot(value: unknown): value is PlanToolSnapshot {
  return (
    isRecord(value) &&
    typeof value.binary === "string" &&
    typeof value.minimumVersion === "string" &&
    typeof value.normalizedVersion === "string" &&
    isDependencyProvider(value.provider) &&
    typeof value.rawVersion === "string"
  );
}

function toPlanToolSnapshot(
  diagnostic: DependencyDiagnostic
): PlanToolSnapshot {
  return {
    binary: diagnostic.binary,
    minimumVersion: diagnostic.minimumVersion,
    normalizedVersion: diagnostic.normalizedVersion ?? "",
    provider: diagnostic.provider,
    rawVersion: diagnostic.rawVersion ?? "",
  };
}

function isDependencyProvider(value: unknown): value is DependencyProvider {
  return ["apt", "brew", "manual", "system", "unknown"].includes(
    value as string
  );
}

function sameFingerprint(
  left: PlanFingerprint,
  right: PlanFingerprint
): boolean {
  return (
    left.algorithm === right.algorithm &&
    left.digest === right.digest &&
    left.size === right.size
  );
}

function runtimeDifferencesFor(
  expected: PlanRuntimeSnapshot,
  actual: PlanRuntimeSnapshot
): Array<{ actual: string; expected: string; field: string }> {
  return ["platform", "squeezitVersion"].flatMap((field) => {
    const expectedValue = expected[field as "platform" | "squeezitVersion"];
    const actualValue = actual[field as "platform" | "squeezitVersion"];
    return expectedValue === actualValue
      ? []
      : [{ field, expected: expectedValue, actual: actualValue }];
  });
}

function toolDifferencesFor(
  expected: PlanToolSnapshot[],
  actual: PlanToolSnapshot[]
): Array<Record<string, unknown>> {
  const actualByBinary = new Map(actual.map((tool) => [tool.binary, tool]));

  return expected.flatMap((expectedTool) => {
    const actualTool = actualByBinary.get(expectedTool.binary);
    if (
      actualTool &&
      actualTool.provider === expectedTool.provider &&
      actualTool.normalizedVersion === expectedTool.normalizedVersion
    ) {
      return [];
    }

    return [
      {
        actual: actualTool
          ? {
              normalizedVersion: actualTool.normalizedVersion,
              provider: actualTool.provider,
            }
          : null,
        binary: expectedTool.binary,
        expected: {
          normalizedVersion: expectedTool.normalizedVersion,
          provider: expectedTool.provider,
        },
      },
    ];
  });
}

function planOutputExists(output: string): SqueezitError {
  return new SqueezitError({
    code: "PLAN_OUTPUT_EXISTS",
    details: { output },
    message: `A plan artifact already exists at ${output}.`,
    remediation:
      "Choose a new --output path or remove the existing plan after reviewing it.",
  });
}

async function inputMismatchFor(
  input: PlanInput
): Promise<Record<string, unknown> | undefined> {
  try {
    const actual = await fingerprintFile(input.path);
    return sameFingerprint(input.fingerprint, actual)
      ? undefined
      : { actual, expected: input.fingerprint, path: input.path };
  } catch {
    return { actual: null, expected: input.fingerprint, path: input.path };
  }
}

function planInputChanged(
  differences: Array<Record<string, unknown>>
): SqueezitError {
  return new SqueezitError({
    code: "PLAN_INPUT_CHANGED",
    details: {
      differences,
      paths: differences.map((difference) => difference.path),
    },
    message: "One or more planned inputs changed after this plan was created.",
    remediation: "Create and review a new plan before applying image changes.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
