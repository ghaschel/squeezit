import { describe, expect, test } from "vitest";

import {
  createCommandEnvelope,
  createCommandErrorEnvelope,
  createCommandStatusEnvelope,
  requiresExplicitConfirmation,
} from "../../src/cli/output";

describe("CLI JSON output", () => {
  test("wraps successful command data in the stable envelope", () => {
    expect(createCommandEnvelope("deps doctor", { tools: [] })).toEqual({
      schemaVersion: 1,
      command: "deps doctor",
      ok: true,
      data: { tools: [] },
    });
  });

  test("keeps validation errors in the same stable envelope", () => {
    expect(
      createCommandErrorEnvelope("compress", new Error("invalid profile"))
    ).toEqual({
      schemaVersion: 1,
      command: "compress",
      ok: false,
      data: {},
      error: {
        message: "invalid profile",
      },
    });
  });
});

test("marks a completed command with per-file failures as unhealthy", () => {
  expect(createCommandStatusEnvelope("compress", false, { failed: 1 })).toEqual(
    {
      schemaVersion: 1,
      command: "compress",
      ok: false,
      data: { failed: 1 },
    }
  );
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
