import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import { commandExists, runCommand } from "../../src/utils/exec";

describe("command execution", () => {
  test("treats a missing executable as a failed command", async () => {
    const missingBinary = `squeezit-test-missing-${randomUUID()}`;

    const result = await runCommand(missingBinary, []);

    expect(result.exitCode).not.toBe(0);
    expect(await commandExists(missingBinary)).toBe(false);
  });
});
