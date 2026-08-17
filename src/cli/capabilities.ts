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
}

interface CommandSemantics {
  confirmation: { requiredWhen: string };
  effects: string[];
  outputSchema: string;
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
      requiredWhen: "writes-files-in-json-or-non-interactive-mode",
    },
    effects: ["writes-files"],
    outputSchema: "#/$defs/optimizationData",
  },
  "deps doctor": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment"],
    outputSchema: "#/$defs/dependenciesDoctorData",
  },
  "deps install": {
    confirmation: {
      requiredWhen: "installs-dependencies-in-json-or-non-interactive-mode",
    },
    effects: ["installs-dependencies"],
    outputSchema: "#/$defs/dependenciesInstallData",
  },
  doctor: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-environment"],
    outputSchema: "#/$defs/doctorData",
  },
  help: {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-cli-metadata"],
    outputSchema: "#/$defs/helpData",
  },
  "metadata strip": {
    confirmation: {
      requiredWhen: "writes-files-in-json-or-non-interactive-mode",
    },
    effects: ["writes-files"],
    outputSchema: "#/$defs/optimizationData",
  },
  "update apply": {
    confirmation: {
      requiredWhen: "updates-installation-in-json-or-non-interactive-mode",
    },
    effects: ["updates-installation"],
    outputSchema: "#/$defs/updateApplyData",
  },
  "update check": {
    confirmation: NEVER_CONFIRM,
    effects: ["reads-network", "reads-installation"],
    outputSchema: "#/$defs/updateCheckData",
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
  };
}

function displayCommandId(id: string): string {
  return id.replaceAll(":", " ");
}
