import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { execa } from "execa";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "bin/run.js");

describe("agent capability discovery", () => {
  test("describes compress arguments, enumerated flags, safeguards, and schemas", async () => {
    const envelope = await runJson(["capabilities", "--json"]);
    const commands = envelope.data.commands as Array<Record<string, unknown>>;
    const compress = commands.find((command) => command.id === "compress");

    expect(envelope).toMatchObject({
      command: "capabilities",
      data: {
        schemas: {
          capabilities: {
            localPath: "schemas/capabilities-v1.schema.json",
            url: expect.stringContaining("unpkg.com/squeezit@"),
          },
          envelope: {
            localPath: "schemas/command-envelope-v2.schema.json",
            url: expect.stringContaining("unpkg.com/squeezit@"),
          },
          events: {
            localPath: "schemas/command-events-v1.schema.json",
            url: expect.stringContaining("unpkg.com/squeezit@"),
          },
          optimizationPlan: {
            localPath: "schemas/optimization-plan-v1.schema.json",
            url: expect.stringContaining("unpkg.com/squeezit@"),
          },
        },
      },
      ok: true,
      schemaVersion: 2,
    });
    expect(compress).toMatchObject({
      arguments: [
        {
          multiple: true,
          name: "patterns",
          required: false,
        },
      ],
      confirmation: {
        requiredWhen: "writes-files-in-json-events-or-non-interactive-mode",
      },
      effects: ["writes-files"],
      events: {
        format: "jsonl",
        lifecycle: expect.arrayContaining([
          "command.started",
          "command.completed",
          "command.failed",
          "phase.started",
          "phase.completed",
          "input.started",
          "input.completed",
        ]),
        schema: "schemas/command-events-v1.schema.json",
      },
      id: "compress",
      json: true,
      outputSchema: "#/$defs/optimizationData",
      flags: expect.arrayContaining([
        expect.objectContaining({
          default: "standard",
          name: "profile",
          options: ["standard", "max"],
        }),
        expect.objectContaining({
          default: "auto",
          name: "progress",
          options: ["auto", "off"],
        }),
        expect.objectContaining({
          default: null,
          name: "json",
          options: [],
          type: "boolean",
        }),
      ]),
    });
  });

  test("covers every first-party command and identifies the autocomplete exception", async () => {
    const envelope = await runJson(["capabilities", "--json"]);
    const commands = envelope.data.commands as Array<Record<string, unknown>>;
    const firstParty = commands.filter(
      (command) => command.origin === "squeezit"
    );
    const commandById = new Map(
      commands.map((command) => [command.id, command])
    );

    expect(firstParty.map((command) => command.id)).toEqual([
      "capabilities",
      "commands",
      "compress",
      "deps doctor",
      "deps install",
      "doctor",
      "help",
      "metadata strip",
      "plan apply",
      "plan compress",
      "plan metadata strip",
      "update apply",
      "update check",
      "version",
    ]);
    expect(firstParty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flags: expect.arrayContaining([
            expect.objectContaining({
              name: "events",
              options: ["jsonl"],
            }),
            expect.objectContaining({ name: "json", type: "boolean" }),
          ]),
          events: expect.objectContaining({ format: "jsonl" }),
          json: true,
        }),
      ])
    );
    expect(commandById.get("metadata strip")).toMatchObject({
      aliases: ["exif"],
    });
    expect(commandById.get("plan metadata strip")).toMatchObject({
      aliases: ["plan exif"],
      confirmation: { requiredWhen: "never" },
      effects: ["reads-environment", "reads-files", "writes-plan-artifact"],
      outputSchema: "#/$defs/planCreationData",
    });
    expect(commandById.get("plan apply")).toMatchObject({
      confirmation: { requiredWhen: "always-requires-yes" },
      effects: ["writes-files"],
      outputSchema: "#/$defs/planApplyData",
      flags: expect.arrayContaining([
        expect.objectContaining({
          default: "auto",
          name: "progress",
          options: ["auto", "off"],
        }),
      ]),
    });
    expect(commandById.get("deps install")).toMatchObject({
      confirmation: {
        requiredWhen:
          "installs-dependencies-in-json-events-or-non-interactive-mode",
      },
      effects: ["installs-dependencies"],
    });
    expect(commandById.get("update apply")).toMatchObject({
      confirmation: {
        requiredWhen:
          "updates-installation-in-json-events-or-non-interactive-mode",
      },
      effects: ["updates-installation"],
    });
    expect(commandById.get("update check")).toMatchObject({
      flags: expect.arrayContaining([
        expect.objectContaining({
          name: "pm",
          options: ["npm", "bun", "brew"],
        }),
      ]),
    });
    expect(commandById.get("autocomplete")).toMatchObject({
      events: { format: null, lifecycle: [], schema: null },
      json: false,
      origin: "external",
      outputSchema: null,
    });
  });

  test("validates a v2 command result and the capabilities document", async () => {
    const [envelopeSchema, capabilitiesSchema, planSchema, envelope] =
      await Promise.all([
        readSchema("command-envelope-v2.schema.json"),
        readSchema("capabilities-v1.schema.json"),
        readSchema("optimization-plan-v1.schema.json"),
        runJson(["capabilities", "--json"]),
      ]);
    const ajv = new Ajv2020({ logger: false, strict: false });

    ajv.addSchema(capabilitiesSchema);
    ajv.addSchema(planSchema);
    expect(ajv.compile(envelopeSchema)(envelope)).toBe(true);
    expect(ajv.compile(capabilitiesSchema)(envelope.data)).toBe(true);
  });
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, "schemas", name), "utf8"));
}

async function runJson(args: string[]): Promise<{
  command: string;
  data: Record<string, unknown>;
  ok: boolean;
  schemaVersion: number;
}> {
  const result = await execa(process.execPath, [launcher, ...args], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return JSON.parse(result.stdout) as {
    command: string;
    data: Record<string, unknown>;
    ok: boolean;
    schemaVersion: number;
  };
}
