import type { Command } from "@oclif/core";

export interface CommandCapability {
  aliases: string[];
  arguments: Array<{
    description: string | null;
    multiple: boolean;
    name: string;
    required: boolean;
  }>;
  confirmation: { requiredWhen: string };
  description: string | null;
  effects: string[];
  events: {
    format: "jsonl" | null;
    lifecycle: string[];
    schema: string | null;
  };
  flags: Array<{
    char: string | null;
    default: unknown;
    description: string | null;
    name: string;
    options: string[];
    required: boolean;
    type: string;
  }>;
  id: string;
  json: boolean;
  origin: "external" | "squeezit";
  outputSchema: string | null;
  receipt: {
    resume: string | null;
    schema: string | null;
    supported: boolean;
  };
}

const EVENT_SCHEMA_PATH = "schemas/command-events-v1.schema.json";
const RECEIPT_SCHEMA_PATH = "schemas/run-receipt-v1.schema.json";
const TERMINAL_EVENT_LIFECYCLE = [
  "command.started",
  "command.completed",
  "command.failed",
];
const PHASE_EVENT_LIFECYCLE = ["phase.started", "phase.completed"];
const INPUT_EVENT_LIFECYCLE = ["input.started", "input.completed"];
const PHASE_COMMANDS = new Set([
  "compress",
  "deps doctor",
  "deps install",
  "doctor",
  "metadata strip",
  "plan apply",
  "plan compress",
  "plan metadata strip",
  "receipt resume",
  "update apply",
  "update check",
]);
const INPUT_COMMANDS = new Set([
  "compress",
  "metadata strip",
  "plan apply",
  "plan compress",
  "plan metadata strip",
  "receipt resume",
]);

interface CommandSemantics {
  confirmation: { requiredWhen: string };
  effects: string[];
  outputSchema: string;
  receipt?: { resume: string | null; supported: boolean };
}

const NEVER_CONFIRM = { requiredWhen: "never" };

const COMMAND_SEMANTICS: Record<string, CommandSemantics> = {
  capabilities: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-cli-metadata"],
    outputSchema: "#/$defs/capabilitiesData",
  },
  commands: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-cli-metadata"],
    outputSchema: "#/$defs/commandsData",
  },
  compress: {
    confirmation: {
      requiredWhen: "writes-files-in-json-events-or-non-interactive-mode",
    },
    effects: ["writes-files"],
    outputSchema: "#/$defs/optimizationData",
    receipt: {
      resume: "retry-incomplete-or-failed-image-inputs",
      supported: true,
    },
  },
  "deps doctor": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment"],
    outputSchema: "#/$defs/dependenciesDoctorData",
    receipt: { resume: null, supported: true },
  },
  "deps install": {
    confirmation: {
      requiredWhen:
        "installs-dependencies-in-json-events-or-non-interactive-mode",
    },
    effects: ["installs-dependencies"],
    outputSchema: "#/$defs/dependenciesInstallData",
    receipt: { resume: null, supported: true },
  },
  doctor: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment"],
    outputSchema: "#/$defs/doctorData",
    receipt: { resume: null, supported: true },
  },
  help: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-cli-metadata"],
    outputSchema: "#/$defs/helpData",
  },
  "metadata strip": {
    confirmation: {
      requiredWhen: "writes-files-in-json-events-or-non-interactive-mode",
    },
    effects: ["writes-files"],
    outputSchema: "#/$defs/optimizationData",
    receipt: {
      resume: "retry-incomplete-or-failed-image-inputs",
      supported: true,
    },
  },
  "plan apply": {
    confirmation: { requiredWhen: "always-requires-yes" },
    effects: ["writes-files"],
    outputSchema: "#/$defs/planApplyData",
    receipt: {
      resume: "retry-incomplete-or-failed-image-inputs",
      supported: true,
    },
  },
  "plan compress": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment", "reads-files", "writes-plan-artifact"],
    outputSchema: "#/$defs/planCreationData",
    receipt: { resume: null, supported: true },
  },
  "plan metadata strip": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment", "reads-files", "writes-plan-artifact"],
    outputSchema: "#/$defs/planCreationData",
    receipt: { resume: null, supported: true },
  },
  "receipt resume": {
    confirmation: { requiredWhen: "always-requires-yes" },
    effects: ["reads-receipt", "writes-files", "writes-receipt"],
    outputSchema: "#/$defs/receiptResumeData",
    receipt: {
      resume: "creates-a-new-linked-receipt-from-a-source-receipt",
      supported: true,
    },
  },
  "update apply": {
    confirmation: {
      requiredWhen:
        "updates-installation-in-json-events-or-non-interactive-mode",
    },
    effects: ["updates-installation"],
    outputSchema: "#/$defs/updateApplyData",
    receipt: { resume: null, supported: true },
  },
  "update check": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-network", "reads-installation"],
    outputSchema: "#/$defs/updateCheckData",
    receipt: { resume: null, supported: true },
  },
  version: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-installation"],
    outputSchema: "#/$defs/versionData",
  },
};

export function collectCommandCapabilities(
  commands: Command.Loadable[],
  packageName: string
): CommandCapability[] {
  const uniqueCommands = new Map<string, Command.Loadable>();

  for (const command of commands) {
    if (command.hidden) continue;
    const key = command.relativePath?.join("/") ?? command.id;
    const existing = uniqueCommands.get(key);
    if (!existing || !command.aliases.includes(command.id)) {
      uniqueCommands.set(key, command);
    }
  }

  return Array.from(uniqueCommands.values())
    .map((command) => toCommandCapability(command, packageName))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function toCommandCapability(
  command: Command.Loadable,
  packageName: string
): CommandCapability {
  const id = displayCommandId(command.id);
  const firstParty = command.pluginName === packageName;
  const semantics = firstParty ? COMMAND_SEMANTICS[id] : undefined;

  if (firstParty && !semantics) {
    throw new Error(`Missing capability semantics for ${id}`);
  }

  return {
    aliases: command.aliases.map(displayCommandId),
    arguments: Object.entries(command.args).map(([name, argument]) => ({
      description: argument.description ?? null,
      multiple: Boolean(argument.multiple),
      name,
      required: Boolean(argument.required),
    })),
    confirmation: semantics?.confirmation ?? { requiredWhen: "unknown" },
    description: command.description ?? null,
    effects: semantics?.effects ?? [],
    events: eventCapability(id, firstParty),
    flags: Object.entries(command.flags)
      .map(([name, flag]) => ({
        char: flag.char ?? null,
        default: flag.default ?? null,
        description: flag.description ?? null,
        name,
        options:
          "options" in flag && Array.isArray(flag.options) ? flag.options : [],
        required: Boolean(flag.required),
        type: flag.type,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    id,
    json: firstParty,
    origin: firstParty ? "squeezit" : "external",
    outputSchema: semantics?.outputSchema ?? null,
    receipt: firstParty
      ? {
          resume: semantics?.receipt?.resume ?? null,
          schema: semantics?.receipt?.supported ? RECEIPT_SCHEMA_PATH : null,
          supported: Boolean(semantics?.receipt?.supported),
        }
      : { resume: null, schema: null, supported: false },
  };
}

function eventCapability(
  command: string,
  firstParty: boolean
): CommandCapability["events"] {
  if (!firstParty) return { format: null, lifecycle: [], schema: null };

  return {
    format: "jsonl",
    lifecycle: [
      ...TERMINAL_EVENT_LIFECYCLE,
      ...(PHASE_COMMANDS.has(command) ? PHASE_EVENT_LIFECYCLE : []),
      ...(INPUT_COMMANDS.has(command) ? INPUT_EVENT_LIFECYCLE : []),
    ],
    schema: EVENT_SCHEMA_PATH,
  };
}

function displayCommandId(id: string): string {
  return id.replaceAll(":", " ");
}
