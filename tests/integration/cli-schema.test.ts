import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
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

describe("published JSON Schemas", () => {
  test("validate success and error envelopes produced by the compiled CLI", async () => {
    const workspace = await createWorkspace();
    const image = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const unsupported = resolve(workspace, "notes.txt");
    await writeFile(unsupported, "not an image");
    const validator = await createEnvelopeValidator();
    const results = await Promise.all([
      runJson(["commands", "--json"]),
      runJson(["compress", "--profile", "invalid", "--json"]),
      runJson(["compress", image, "--json"], { cwd: workspace }),
      runJson(["compress", unsupported, "--json"], { cwd: workspace }),
      runJson(["update", "check", "--pm", "brew", "--json"]),
    ]);

    for (const result of results) {
      expect(validator(result.envelope), JSON.stringify(validator.errors)).toBe(
        true
      );
    }
    expect(results.map((result) => result.envelope.ok)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

async function createEnvelopeValidator() {
  const [capabilitiesSchema, envelopeSchema] = await Promise.all([
    readSchema("capabilities-v1.schema.json"),
    readSchema("command-envelope-v2.schema.json"),
  ]);
  const ajv = new Ajv2020({ logger: false, strict: false });
  ajv.addSchema(capabilitiesSchema);
  return ajv.compile(envelopeSchema);
}

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-cli-schema-");
  workspaces.push(workspace);
  return workspace;
}

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, "schemas", name), "utf8"));
}

async function runJson(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ envelope: { ok: boolean } }> {
  const result = await execa(process.execPath, [launcher, ...args], {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    reject: false,
  });

  return { envelope: JSON.parse(result.stdout) as { ok: boolean } };
}
