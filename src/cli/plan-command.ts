import type { CompressCommandOptions, ResolvedInput } from "../types";
import type { OptimizationInputGuard } from "../utils";
import { findUnsupportedExplicitInputs, resolveInputs } from "../utils";
import {
  createOptimizationPlan,
  type OptimizationPlan,
  type OptimizationPlanOperation,
  type PlanOptimizationOptions,
  type PlanRuntimeSnapshot,
  readOptimizationPlan,
  snapshotPlanTools,
  verifyOptimizationPlan,
  verifyPlanInput,
  writeOptimizationPlan,
} from "./optimization-plan";
import { SqueezitError } from "./output";

export async function createPlanArtifact(params: {
  operation: OptimizationPlanOperation;
  options: CompressCommandOptions;
  output: string;
  runtime: PlanRuntimeSnapshot;
}): Promise<{
  output: { path: string };
  plan: OptimizationPlan;
}> {
  const [inputs, unsupportedInputs] = await Promise.all([
    resolveInputs(params.options),
    findUnsupportedExplicitInputs(params.options),
  ]);

  if (unsupportedInputs.length > 0) {
    throw new SqueezitError({
      code: "UNSUPPORTED_FORMAT",
      details: { paths: unsupportedInputs },
      message: `Unsupported image format: ${unsupportedInputs.join(", ")}`,
      remediation: "Use a supported image format or remove this input.",
    });
  }

  const plan = await createOptimizationPlan({
    inputs,
    operation: params.operation,
    options: toPlanOptions(params.options),
    runtime: params.runtime,
    tools: await snapshotPlanTools(inputs, params.options, true),
  });
  const output = await writeOptimizationPlan(params.output, plan);

  return { output: { path: output }, plan };
}

export async function preparePlanApply(params: {
  path: string;
  runtime: PlanRuntimeSnapshot;
  verbose: boolean;
  progress: "auto" | "off";
}): Promise<{
  inputGuard: OptimizationInputGuard;
  inputs: ResolvedInput[];
  options: CompressCommandOptions;
  plan: OptimizationPlan;
}> {
  const plan = await readOptimizationPlan(params.path);
  const options = optionsFromPlan(plan, params);
  const tools = await snapshotPlanTools(
    plan.inputs.map(toResolvedInput),
    options,
    false
  );
  const inputs = await verifyOptimizationPlan({
    plan,
    runtime: params.runtime,
    tools,
  });

  const inputsByPath = new Map(plan.inputs.map((input) => [input.path, input]));
  const inputGuard: OptimizationInputGuard = {
    async verify(input) {
      const plannedInput = inputsByPath.get(input.absolutePath);
      if (!plannedInput) {
        throw new SqueezitError({
          code: "PLAN_INPUT_CHANGED",
          details: { paths: [input.absolutePath] },
          message:
            "The optimizer attempted to use an input outside the reviewed plan.",
          remediation:
            "Create and review a new plan before applying image changes.",
        });
      }

      await verifyPlanInput(plannedInput);
    },
  };

  return { inputGuard, inputs, options, plan };
}

export function runtimeSnapshot(params: {
  cwd?: string;
  squeezitVersion: string;
}): PlanRuntimeSnapshot {
  return {
    cwd: params.cwd ?? process.cwd(),
    nodeVersion: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    squeezitVersion: params.squeezitVersion,
  };
}

export function toPlanOptions(
  options: CompressCommandOptions
): PlanOptimizationOptions {
  return {
    concurrency: options.concurrency,
    exifOnly: options.exifOnly,
    inPlace: options.inPlace,
    keepTime: options.keepTime,
    max: options.max,
    stripMeta: options.stripMeta,
    threshold: options.threshold,
  };
}

function optionsFromPlan(
  plan: OptimizationPlan,
  presentation: { progress: "auto" | "off"; verbose: boolean }
): CompressCommandOptions {
  return {
    cwd: plan.runtime.cwd,
    dryRun: false,
    installDeps: false,
    patterns: [],
    progress: presentation.progress,
    recursive: false,
    verbose: presentation.verbose,
    ...plan.options,
  };
}

function toResolvedInput(
  input: OptimizationPlan["inputs"][number]
): ResolvedInput {
  return { absolutePath: input.path, displayPath: input.displayPath };
}
