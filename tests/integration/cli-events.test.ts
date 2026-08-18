import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

describe("JSON Lines CLI event contract", () => {
  test("streams command provenance and its terminal result", async () => {
    const result = await execa(
      process.execPath,
      [launcher, "commands", "--events", "jsonl"],
      {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      command: "commands",
      event: "command.started",
      meta: expect.objectContaining({
        cwd: root,
        squeezitVersion: expect.any(String),
      }),
      schemaVersion: 1,
      sequence: 1,
    });
    expect(events[1]).toMatchObject({
      command: "commands",
      data: { commands: expect.any(Array) },
      event: "command.completed",
      ok: true,
      schemaVersion: 1,
      sequence: 2,
    });
    expect(events[1]?.runId).toBe(events[0]?.runId);
  });

  test("terminates validation failures with a structured failed event", async () => {
    const result = await execa(
      process.execPath,
      [launcher, "commands", "--events", "jsonl", "--unknown"],
      {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");

    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      command: "commands",
      data: {},
      error: { code: "VALIDATION_ERROR" },
      event: "command.failed",
      ok: false,
      sequence: 2,
    });
  });

  test("streams phases and per-file lifecycle for a dry-run compression job", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-events-");
    workspaces.push(workspace);
    const image = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const result = await execa(
      process.execPath,
      [
        launcher,
        "compress",
        image,
        "--dry-run",
        "--progress",
        "auto",
        "--events",
        "jsonl",
      ],
      {
        cwd: workspace,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const validator = await createEventValidator();
    const eventNames = events.map((event) => event.event);

    expect(eventNames).toEqual([
      "command.started",
      "phase.started",
      "phase.completed",
      "phase.started",
      "phase.completed",
      "phase.started",
      "input.started",
      "input.completed",
      "phase.completed",
      "command.completed",
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "phase.completed",
          phase: "input-discovery",
        }),
        expect.objectContaining({
          event: "phase.completed",
          phase: "dependency-validation",
        }),
        expect.objectContaining({
          event: "input.started",
          input: { index: 0, path: image },
        }),
        expect.objectContaining({
          data: {
            result: expect.objectContaining({
              filePath: image,
              status: "dry-run",
            }),
          },
          event: "input.completed",
          input: { index: 0, path: image },
        }),
      ])
    );
    for (const event of events) {
      expect(validator(event), JSON.stringify(validator.errors)).toBe(true);
    }
  });

  test("streams fingerprint lifecycle while creating a plan artifact", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-events-");
    workspaces.push(workspace);
    const image = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "plans", "compress.json");
    const result = await execa(
      process.execPath,
      [
        launcher,
        "plan",
        "compress",
        image,
        "--output",
        output,
        "--events",
        "jsonl",
      ],
      {
        cwd: workspace,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events.map((event) => event.event)).toContain("input.started");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "phase.completed",
          phase: "fingerprinting",
        }),
        expect.objectContaining({
          data: {
            fingerprint: expect.objectContaining({ algorithm: "sha256" }),
          },
          event: "input.completed",
          input: { index: 0, path: image },
        }),
        expect.objectContaining({
          event: "phase.completed",
          phase: "plan-writing",
        }),
      ])
    );
  });

  test("streams plan validation and optimization lifecycle when applying a plan", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-events-");
    workspaces.push(workspace);
    const image = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const output = join(workspace, "compress.json");
    const planned = await execa(
      process.execPath,
      [launcher, "plan", "compress", image, "--output", output, "--json"],
      {
        cwd: workspace,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      }
    );
    expect(JSON.parse(planned.stdout)).toMatchObject({ ok: true });

    const result = await execa(
      process.execPath,
      [launcher, "plan", "apply", output, "--yes", "--events", "jsonl"],
      {
        cwd: workspace,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(0);
    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "phase.completed",
          phase: "plan-validation",
        }),
        expect.objectContaining({
          event: "phase.completed",
          phase: "optimization",
        }),
        expect.objectContaining({
          data: {
            result: expect.objectContaining({ filePath: image }),
          },
          event: "input.completed",
          input: { index: 0, path: image },
        }),
      ])
    );
  });

  test("streams environment inspection for doctor without human formatting", async () => {
    const result = await execa(
      process.execPath,
      [launcher, "doctor", "--events", "jsonl"],
      {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.stderr).toBe("");

    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const terminal = events.at(-1);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "phase.started",
          phase: "environment-inspection",
        }),
        expect.objectContaining({
          event: "phase.completed",
          phase: "environment-inspection",
        }),
      ])
    );
    expect(terminal).toMatchObject({ event: "command.completed" });
    expect(result.exitCode === 0).toBe(terminal?.ok);
  });

  test("keeps the existing final JSON contract when event mode conflicts with it", async () => {
    const result = await execa(
      process.execPath,
      [launcher, "commands", "--json", "--events", "jsonl"],
      {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "commands",
      error: { code: "VALIDATION_ERROR" },
      ok: false,
      schemaVersion: 2,
    });
  });

  test("requires --yes before image changes in JSON Lines mode", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-events-");
    workspaces.push(workspace);
    const image = await copyFixtureToWorkspace(
      representativeFixtures.png,
      workspace
    );
    const result = await execa(
      process.execPath,
      [launcher, "compress", image, "--events", "jsonl"],
      {
        cwd: workspace,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        reject: false,
      }
    );

    expect(result.exitCode).toBe(1);
    const terminal = JSON.parse(
      result.stdout.trim().split("\n").at(-1) ?? "{}"
    ) as Record<string, unknown>;
    expect(terminal).toMatchObject({
      error: { code: "CONFIRMATION_REQUIRED" },
      event: "command.failed",
      ok: false,
    });
  });

  test("gives every first-party command a header and one terminal event", async () => {
    const workspace = await createTempWorkspace("squeezit-cli-events-");
    workspaces.push(workspace);
    const validator = await createEventValidator();
    const commands = [
      ["capabilities"],
      ["commands"],
      ["version"],
      ["help"],
      ["doctor"],
      ["deps", "doctor"],
      ["compress", "--dry-run"],
      ["metadata", "strip", "--dry-run"],
      ["plan", "compress", "--output", join(workspace, "compress.json")],
      [
        "plan",
        "metadata",
        "strip",
        "--output",
        join(workspace, "metadata.json"),
      ],
      ["plan", "apply", "missing-plan.json", "--yes"],
      [
        "receipt",
        "resume",
        "missing-receipt.json",
        "--output",
        join(workspace, "resumed.json"),
        "--yes",
      ],
      ["deps", "install"],
      ["update", "apply"],
      ["update", "check", "--pm", "unsupported"],
    ];

    for (const command of commands) {
      const result = await execa(
        process.execPath,
        [launcher, ...command, "--events", "jsonl"],
        {
          cwd: workspace,
          env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
          reject: false,
        }
      );
      const events = result.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const terminal = events.at(-1);

      expect(result.stderr, command.join(" ")).toBe("");
      expect(
        events.map((event) => event.sequence),
        command.join(" ")
      ).toEqual(events.map((_, index) => index + 1));
      expect(
        new Set(events.map((event) => event.runId)).size,
        command.join(" ")
      ).toBe(1);
      expect(
        events.filter((event) => event.event === "command.started"),
        command.join(" ")
      ).toHaveLength(1);
      expect(
        events.filter((event) =>
          /^command\.(completed|failed)$/.test(String(event.event))
        ),
        command.join(" ")
      ).toHaveLength(1);
      for (const event of events) {
        expect(
          validator(event),
          `${command.join(" ")}: ${JSON.stringify(validator.errors)}`
        ).toBe(true);
      }
      expect(events[0], command.join(" ")).toMatchObject({
        event: "command.started",
        sequence: 1,
      });
      expect(terminal, command.join(" ")).toMatchObject({
        event: expect.stringMatching(/^command\.(completed|failed)$/),
      });
      expect(result.exitCode === 0, command.join(" ")).toBe(terminal?.ok);
    }
  }, 15_000);
});

async function createEventValidator() {
  const schema = JSON.parse(
    await readFile(
      resolve(root, "schemas", "command-events-v1.schema.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
  return new Ajv2020({ logger: false, strict: false }).compile(schema);
}
