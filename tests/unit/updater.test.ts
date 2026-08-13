import { describe, expect, test, vi } from "vitest";

import {
  createUpdatePlan,
  createUpdateService,
  resolvePackageManager,
} from "../../src/utils/updater";

describe("updater service", () => {
  test("does not resolve Homebrew when the active installation is not formula-managed", () => {
    expect(
      resolvePackageManager({
        override: "brew",
        persistedConfig: null,
        bunRuntime: false,
        brewFormulaManaged: false,
      })
    ).toBeNull();
  });

  test("returns the Homebrew upgrade plan", () => {
    expect(createUpdatePlan("brew", "squeezit")).toEqual({
      packageManager: "brew",
      command: "brew",
      args: ["upgrade", "squeezit"],
    });
  });

  test("checks for an update without persisting installer configuration", async () => {
    const writeInstallerConfig = vi.fn();
    const isFormulaManaged = vi.fn(async () => false);
    const service = createUpdateService({
      fetchLatestVersion: async () => "2.0.0",
      isFormulaManaged,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      readInstallerConfig: async () => null,
      readPackageMetadata: async () => ({ name: "squeezit", version: "1.0.0" }),
      runCheckedCommand: async () => ({
        all: "",
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      writeInstallerConfig,
    });

    const result = await service.check({
      overridePackageManager: "npm",
      bunRuntime: false,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "update-available",
      packageManager: "npm",
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
    });
    expect(writeInstallerConfig).not.toHaveBeenCalled();
    expect(isFormulaManaged).not.toHaveBeenCalled();
  });

  test("persists the selected installer only after a successful update command", async () => {
    const writeInstallerConfig = vi.fn();
    const runCheckedCommand = vi.fn(async () => ({
      all: "",
      exitCode: 0,
      stderr: "",
      stdout: "",
    }));
    const service = createUpdateService({
      fetchLatestVersion: async () => "2.0.0",
      isFormulaManaged: async () => false,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      readInstallerConfig: async () => null,
      readPackageMetadata: async () => ({ name: "squeezit", version: "1.0.0" }),
      runCheckedCommand,
      writeInstallerConfig,
    });

    const result = await service.apply(
      { overridePackageManager: "bun", bunRuntime: false },
      async () => true
    );

    expect(result).toMatchObject({
      ok: true,
      status: "updated",
      packageManager: "bun",
    });
    expect(runCheckedCommand).toHaveBeenCalledWith(
      "bun",
      ["add", "-g", "squeezit@latest"],
      { stdio: "inherit" }
    );
    expect(writeInstallerConfig).toHaveBeenCalledWith({
      packageManager: "bun",
      packageName: "squeezit",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
  });

  test("does not persist installer configuration when the update command fails", async () => {
    const writeInstallerConfig = vi.fn();
    const service = createUpdateService({
      fetchLatestVersion: async () => "2.0.0",
      isFormulaManaged: async () => false,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      readInstallerConfig: async () => null,
      readPackageMetadata: async () => ({ name: "squeezit", version: "1.0.0" }),
      runCheckedCommand: async () => {
        throw new Error("npm failed");
      },
      writeInstallerConfig,
    });

    await expect(
      service.apply(
        { overridePackageManager: "npm", bunRuntime: false },
        async () => true
      )
    ).rejects.toThrow("npm failed");
    expect(writeInstallerConfig).not.toHaveBeenCalled();
  });

  test("returns a structured error when Homebrew is requested outside a formula installation", async () => {
    const fetchLatestVersion = vi.fn(async () => "2.0.0");
    const service = createUpdateService({
      fetchLatestVersion,
      isFormulaManaged: async () => false,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      readInstallerConfig: async () => null,
      readPackageMetadata: async () => ({ name: "squeezit", version: "1.0.0" }),
      runCheckedCommand: async () => ({
        all: "",
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      writeInstallerConfig: async () => undefined,
    });

    await expect(
      service.check({ overridePackageManager: "brew", bunRuntime: false })
    ).resolves.toMatchObject({
      ok: false,
      code: "BREW_NOT_FORMULA_MANAGED",
    });
    expect(fetchLatestVersion).not.toHaveBeenCalled();
  });
});
