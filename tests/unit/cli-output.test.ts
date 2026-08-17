import { describe, expect, test } from "vitest";

import {
  type CommandMeta,
  createCommandEnvelope,
  createCommandErrorEnvelope,
  createCommandStatusEnvelope,
  requiresExplicitConfirmation,
  SqueezitError,
  toSqueezitIssue,
} from "../../src/cli/output";

const meta: CommandMeta = {
  cwd: "/workspace/images",
  executablePath: "/workspace/node_modules/squeezit/bin/run.js",
  invocationPath: "/usr/local/bin/sqz",
  nodeVersion: "24.16.0",
  packageRoot: "/workspace/node_modules/squeezit",
  platform: "darwin-arm64",
  squeezitVersion: "2.1.0",
};

describe("CLI JSON output", () => {
  test("wraps successful command data in the stable envelope", () => {
    expect(createCommandEnvelope("deps doctor", { tools: [] }, meta)).toEqual({
      schemaVersion: 2,
      command: "deps doctor",
      ok: true,
      data: { tools: [] },
      meta,
    });
  });

  test("keeps validation errors in the same stable envelope", () => {
    expect(
      createCommandErrorEnvelope(
        "compress",
        new SqueezitError({
          code: "VALIDATION_ERROR",
          details: { flag: "profile" },
          message: "invalid profile",
          remediation: "Choose a supported profile.",
        }),
        meta
      )
    ).toEqual({
      schemaVersion: 2,
      command: "compress",
      ok: false,
      data: {},
      error: {
        code: "VALIDATION_ERROR",
        details: { flag: "profile" },
        message: "invalid profile",
        remediation: "Choose a supported profile.",
      },
      meta,
    });
  });

  test("preserves typed remediation and details while normalizing unknown errors", () => {
    expect(
      toSqueezitIssue(
        new SqueezitError({
          code: "OPERATION_CANCELLED",
          details: { operation: "update apply" },
          message: "Self-update cancelled.",
          remediation: "Re-run when you are ready to update.",
        })
      )
    ).toEqual({
      code: "OPERATION_CANCELLED",
      details: { operation: "update apply" },
      message: "Self-update cancelled.",
      remediation: "Re-run when you are ready to update.",
    });
    expect(toSqueezitIssue(new Error("unexpected failure"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "unexpected failure",
      remediation:
        "Re-run the command. If the problem persists, report it with the command output.",
    });
  });
});

test("marks a completed command with per-file failures as unhealthy", () => {
  expect(
    createCommandStatusEnvelope("compress", false, { failed: 1 }, meta)
  ).toEqual({
    schemaVersion: 2,
    command: "compress",
    ok: false,
    data: { failed: 1 },
    meta,
  });
});

describe("CLI unattended safeguards", () => {
  test.each([
    ["interactive human output", false, true, false],
    ["JSON output", true, true, true],
    ["non-TTY output", false, false, true],
  ])("requires --yes for %s", (_label, json, isTty, expected) => {
    expect(requiresExplicitConfirmation({ json, isTty })).toBe(expected);
  });
});
