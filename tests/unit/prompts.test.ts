import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({ confirm: hoisted.confirm }));

import {
  confirmDependencyInstall,
  confirmImageOptimization,
  confirmSelfUpdate,
} from "../../src/utils/prompts";

const stdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

describe("interactive confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTty(true);
  });

  afterEach(() => {
    restoreTty();
  });

  test.each([
    ["stdin", false, true],
    ["stdout", true, false],
  ])(
    "auto-approves both operations when %s is not a TTY",
    async (_stream, stdinIsTty, stdoutIsTty) => {
      setTty(stdinIsTty, stdoutIsTty);

      await expect(confirmDependencyInstall("macos", ["oxipng"])).resolves.toBe(
        true
      );
      await expect(confirmSelfUpdate("npm", "1.0.0", "1.1.0")).resolves.toBe(
        true
      );

      expect(hoisted.confirm).not.toHaveBeenCalled();
    }
  );

  test("returns the direct confirmation answer for dependency installation", async () => {
    hoisted.confirm.mockResolvedValue(false);

    await expect(
      confirmDependencyInstall("debian", ["oxipng", "jpegoptim"])
    ).resolves.toBe(false);

    expect(hoisted.confirm).toHaveBeenCalledWith({
      default: true,
      message: "Install 2 missing packages with APT?",
    });
  });

  test("returns the direct confirmation answer for self-updates", async () => {
    hoisted.confirm.mockResolvedValue(false);

    await expect(confirmSelfUpdate("bun", "1.0.0", "1.1.0")).resolves.toBe(
      false
    );

    expect(hoisted.confirm).toHaveBeenCalledWith({
      default: true,
      message: "Update squeezit from 1.0.0 to 1.1.0 using bun?",
    });
  });

  test("confirms image changes before a non-dry-run operation", async () => {
    hoisted.confirm.mockResolvedValue(true);

    await expect(confirmImageOptimization("compress", 2)).resolves.toBe(true);

    expect(hoisted.confirm).toHaveBeenCalledWith({
      default: true,
      message: "Apply compress changes to 2 files?",
    });
  });

  test("propagates prompt failures to the existing command error flow", async () => {
    const error = new Error("prompt interrupted");
    hoisted.confirm.mockRejectedValue(error);

    await expect(confirmDependencyInstall("macos", ["oxipng"])).rejects.toBe(
      error
    );
  });

  test("propagates self-update prompt failures to the existing command error flow", async () => {
    const error = new Error("prompt interrupted");
    hoisted.confirm.mockRejectedValue(error);

    await expect(confirmSelfUpdate("npm", "1.0.0", "1.1.0")).rejects.toBe(
      error
    );
  });
});

function setTty(stdinIsTty: boolean, stdoutIsTty = stdinIsTty): void {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: stdinIsTty,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: stdoutIsTty,
  });
}

function restoreTty(): void {
  restoreProperty(process.stdin, "isTTY", stdinIsTty);
  restoreProperty(process.stdout, "isTTY", stdoutIsTty);
}

function restoreProperty(
  target: NodeJS.ReadStream | NodeJS.WriteStream,
  property: "isTTY",
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}
