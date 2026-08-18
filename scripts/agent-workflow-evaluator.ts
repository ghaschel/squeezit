export interface AgentCapability {
  confirmation: { requiredWhen: string };
  effects: string[];
  id: string;
}

export interface AgentWorkflowAction {
  argv: string[];
  result?: {
    errorCode?: string;
    sourceFingerprint?: { after: string; before: string };
  };
}

export interface AgentWorkflowViolation {
  code:
    | "CAPABILITIES_NOT_DISCOVERED"
    | "CONFIRMATION_MISSING"
    | "DOCTOR_NOT_RUN"
    | "DRY_RUN_MUTATED_INPUT"
    | "FAILURE_IGNORED"
    | "PLAN_NOT_REVIEWED"
    | "PREVIEW_OR_PLAN_REQUIRED";
  index: number;
  message: string;
}

export function evaluateAgentWorkflow(
  capabilities: AgentCapability[],
  actions: AgentWorkflowAction[]
): { ok: boolean; violations: AgentWorkflowViolation[] } {
  const violations: AgentWorkflowViolation[] = [];
  const plans = new Set<string>();
  let capabilitiesDiscovered = false;
  let doctorRun = false;
  let failureSeen = false;

  for (const [index, action] of actions.entries()) {
    const parsed = parseCommand(capabilities, action.argv);
    if (!parsed) continue;
    const { args, capability } = parsed;
    const command = capability.id;
    const imageOperation = isImageOperation(command);
    const dryRun = hasFlag(args, "--dry-run");
    const mutating =
      capability.confirmation.requiredWhen !== "never" && !dryRun;

    if (command === "capabilities") {
      capabilitiesDiscovered = true;
      continue;
    }

    if (!capabilitiesDiscovered) {
      violations.push({
        code: "CAPABILITIES_NOT_DISCOVERED",
        index,
        message: `${command} ran before sqz capabilities --json.`,
      });
    }

    if (failureSeen && (imageOperation || mutating)) {
      violations.push({
        code: "FAILURE_IGNORED",
        index,
        message: `${command} followed a typed command failure without remediation.`,
      });
    }

    if (command === "doctor") {
      doctorRun = true;
      continue;
    }

    if (imageOperation && !doctorRun) {
      violations.push({
        code: "DOCTOR_NOT_RUN",
        index,
        message: `${command} ran before sqz doctor --json.`,
      });
    }

    if (mutating && !hasFlag(args, "--yes") && !hasFlag(args, "-y")) {
      violations.push({
        code: "CONFIRMATION_MISSING",
        index,
        message: `${command} can change state and requires --yes.`,
      });
    }

    if (dryRun) {
      const fingerprint = action.result?.sourceFingerprint;
      if (fingerprint && fingerprint.before !== fingerprint.after) {
        violations.push({
          code: "DRY_RUN_MUTATED_INPUT",
          index,
          message: `${command} changed an input during --dry-run.`,
        });
      }
    }

    if (["compress", "metadata strip"].includes(command) && !dryRun) {
      violations.push({
        code: "PREVIEW_OR_PLAN_REQUIRED",
        index,
        message: `${command} must use --dry-run or a reviewed plan workflow.`,
      });
    }

    if (command === "plan compress") {
      const output = flagValue(args, "--output");
      if (output) plans.add(output);
    }

    if (command === "plan apply") {
      const planPath = args[0];
      if (!planPath || !plans.has(planPath)) {
        violations.push({
          code: "PLAN_NOT_REVIEWED",
          index,
          message:
            "plan apply requires a plan created earlier in the workflow.",
        });
      }
    }

    if (action.result?.errorCode) failureSeen = true;
  }

  return { ok: violations.length === 0, violations };
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.some(
    (argument) => argument === flag || argument.startsWith(`${flag}=`)
  );
}

function isImageOperation(command: string): boolean {
  return [
    "compress",
    "metadata strip",
    "plan apply",
    "plan compress",
    "plan metadata strip",
    "receipt resume",
  ].includes(command);
}

function parseCommand(
  capabilities: AgentCapability[],
  argv: string[]
): { args: string[]; capability: AgentCapability } | undefined {
  const commandArgs = ["sqz", "squeezit"].includes(argv[0] ?? "")
    ? argv.slice(1)
    : argv;
  const capability = capabilities
    .slice()
    .sort((left, right) => right.id.length - left.id.length)
    .find((candidate) => {
      const words = candidate.id.split(" ");
      return words.every((word, index) => commandArgs[index] === word);
    });
  if (!capability) return undefined;

  return {
    args: commandArgs.slice(capability.id.split(" ").length),
    capability,
  };
}
