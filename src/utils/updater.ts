import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

import chalk from "chalk";
import ora from "ora";

import type { InstallerConfig, PackageManager } from "../types";
import {
  detectPackageManagerFromUserAgent,
  readInstallerConfig,
  writeInstallerConfig,
} from "./config";
import { runCheckedCommand, runCommand } from "./exec";
import { confirmSelfUpdate } from "./prompts";

export interface UpdateRequest {
  overridePackageManager?: PackageManager | null;
  userAgent?: string;
  npmExecPath?: string;
  bunRuntime?: boolean;
}

interface UpdateRequestOptions {
  performUpdate: boolean;
  overridePackageManager?: PackageManager | null;
}

export interface PackageMetadata {
  name: string;
  version: string;
}

export interface UpdatePlan {
  packageManager: PackageManager;
  command: string;
  args: string[];
}

interface UpToDateResult {
  ok: true;
  status: "up-to-date";
  currentVersion: string;
  latestVersion: string;
}

export interface UpdateAvailableResult {
  ok: true;
  status: "update-available" | "updated" | "cancelled";
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  packageManager: PackageManager;
  plan: UpdatePlan;
}

export type UpdateResult =
  | UpToDateResult
  | UpdateAvailableResult
  | {
      ok: false;
      code: "PACKAGE_MANAGER_UNRESOLVED" | "BREW_NOT_FORMULA_MANAGED";
      message: string;
      currentVersion: string;
      latestVersion: string;
    };

export interface UpdateServiceDependencies {
  fetchLatestVersion(packageName: string): Promise<string>;
  isFormulaManaged(packageName: string): Promise<boolean>;
  now(): Date;
  readInstallerConfig(): Promise<InstallerConfig | null>;
  readPackageMetadata(): Promise<PackageMetadata>;
  runCheckedCommand: typeof runCheckedCommand;
  writeInstallerConfig(config: InstallerConfig): Promise<void>;
}

export interface UpdateService {
  check(request?: UpdateRequest): Promise<UpdateResult>;
  apply(
    request: UpdateRequest | undefined,
    confirm: () => Promise<boolean>,
    checked?: UpdateResult
  ): Promise<UpdateResult>;
}

export function createUpdateService(
  dependencies: UpdateServiceDependencies
): UpdateService {
  async function check(request: UpdateRequest = {}): Promise<UpdateResult> {
    const metadata = await dependencies.readPackageMetadata();
    const persistedConfig = await dependencies.readInstallerConfig();
    const requestedPackageManager = request.overridePackageManager ?? null;
    const brewFormulaManaged =
      requestedPackageManager === "brew" || !requestedPackageManager
        ? await dependencies.isFormulaManaged(metadata.name)
        : false;
    const packageManager = resolvePackageManager({
      override: requestedPackageManager,
      persistedConfig,
      userAgent: request.userAgent,
      npmExecPath: request.npmExecPath,
      bunRuntime: request.bunRuntime ?? false,
      brewFormulaManaged,
    });

    if (!packageManager) {
      if (
        requestedPackageManager === "brew" ||
        persistedConfig?.packageManager === "brew"
      ) {
        return {
          ok: false,
          code: "BREW_NOT_FORMULA_MANAGED",
          message:
            "Homebrew updates are only available when the active squeezit installation is formula-managed.",
          currentVersion: metadata.version,
          latestVersion: metadata.version,
        };
      }

      return {
        ok: false,
        code: "PACKAGE_MANAGER_UNRESOLVED",
        message:
          "Could not determine how squeezit was installed. Re-run with --pm npm, --pm bun, or --pm brew.",
        currentVersion: metadata.version,
        latestVersion: metadata.version,
      };
    }

    const latestVersion = await dependencies.fetchLatestVersion(metadata.name);

    if (compareVersions(latestVersion, metadata.version) <= 0) {
      return {
        ok: true,
        status: "up-to-date",
        currentVersion: metadata.version,
        latestVersion,
      };
    }

    return {
      ok: true,
      status: "update-available",
      packageManager,
      packageName: metadata.name,
      currentVersion: metadata.version,
      latestVersion,
      plan: createUpdatePlan(packageManager, metadata.name),
    };
  }

  async function apply(
    request: UpdateRequest = {},
    confirm: () => Promise<boolean>,
    checked?: UpdateResult
  ): Promise<UpdateResult> {
    const result = checked ?? (await check(request));
    if (
      !result.ok ||
      result.status !== "update-available" ||
      !result.plan ||
      !result.packageManager
    ) {
      return result;
    }

    if (!(await confirm())) {
      return { ...result, status: "cancelled" };
    }

    await dependencies.runCheckedCommand(
      result.plan.command,
      result.plan.args,
      {
        stdio: "inherit",
      }
    );
    await dependencies.writeInstallerConfig({
      packageManager: result.packageManager,
      packageName: result.packageName,
      updatedAt: dependencies.now().toISOString(),
    });

    return { ...result, status: "updated" };
  }

  return { apply, check };
}

export async function runSelfUpdate(
  options: UpdateRequestOptions
): Promise<void> {
  const spinner = ora("Checking for updates").start();
  const service = createDefaultUpdateService();
  const request = createRuntimeRequest(options.overridePackageManager);
  const checked = await service.check(request);

  if (!checked.ok) {
    spinner.fail(checked.message);
    throw new Error(checked.message);
  }

  if (checked.status === "up-to-date") {
    spinner.succeed(
      `${chalk.bold("squeezit")} is up to date (${chalk.green(checked.currentVersion)})`
    );
    return;
  }

  spinner.succeed(
    `Update available: ${chalk.white(checked.currentVersion)} -> ${chalk.green(checked.latestVersion)}`
  );

  if (!options.performUpdate) {
    logUpdatePlan(checked);
    return;
  }

  console.log(chalk.dim(`Updating with ${checked.packageManager}...`));
  const result = await service.apply(
    request,
    () =>
      confirmSelfUpdate(
        checked.packageManager!,
        checked.currentVersion,
        checked.latestVersion
      ),
    checked
  );

  if (!result.ok) {
    throw new Error(result.message);
  }
  if (result.status === "cancelled") {
    console.log(chalk.yellow("Self-update cancelled."));
    return;
  }
  if (result.status === "updated") {
    console.log(
      chalk.green(
        "squeezit updated. Re-run squeezit --version to verify the active installation."
      )
    );
  }
}

export function createUpdatePlan(
  packageManager: PackageManager,
  packageName: string
): UpdatePlan {
  if (packageManager === "bun") {
    return {
      packageManager,
      command: "bun",
      args: ["add", "-g", `${packageName}@latest`],
    };
  }
  if (packageManager === "brew") {
    return {
      packageManager,
      command: "brew",
      args: ["upgrade", packageName],
    };
  }
  return {
    packageManager,
    command: "npm",
    args: ["install", "-g", `${packageName}@latest`],
  };
}

export function resolvePackageManager(params: {
  override: PackageManager | null;
  persistedConfig: InstallerConfig | null;
  userAgent?: string;
  npmExecPath?: string;
  bunRuntime: boolean;
  brewFormulaManaged?: boolean;
}): PackageManager | null {
  const {
    override,
    persistedConfig,
    userAgent,
    npmExecPath,
    bunRuntime,
    brewFormulaManaged,
  } = params;
  const selected =
    override ??
    (brewFormulaManaged ? "brew" : null) ??
    persistedConfig?.packageManager ??
    detectPackageManagerFromUserAgent(userAgent) ??
    resolveRuntimePackageManager(npmExecPath, bunRuntime);
  if (selected === "brew" && !brewFormulaManaged) {
    return null;
  }
  return selected;
}

export function parsePackageManagerOption(value: string): PackageManager {
  const normalized = value.trim().toLowerCase();
  if (normalized === "npm" || normalized === "bun" || normalized === "brew") {
    return normalized;
  }
  throw new Error("Package manager must be npm, bun, or brew");
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function createDefaultUpdateService(): UpdateService {
  return createUpdateService({
    fetchLatestVersion,
    isFormulaManaged,
    now: () => new Date(),
    readInstallerConfig,
    readPackageMetadata,
    runCheckedCommand,
    writeInstallerConfig,
  });
}

function createRuntimeRequest(
  overridePackageManager?: PackageManager | null
): UpdateRequest {
  return {
    overridePackageManager: overridePackageManager ?? null,
    userAgent: process.env.npm_config_user_agent,
    npmExecPath: process.env.npm_execpath,
    bunRuntime: Boolean(process.versions.bun),
  };
}

function resolveRuntimePackageManager(
  npmExecPath: string | undefined,
  bunRuntime: boolean
): PackageManager | null {
  const execPath = npmExecPath?.toLowerCase() ?? "";
  if (execPath.includes("bun")) return "bun";
  if (execPath.includes("npm")) return "npm";
  return bunRuntime ? "bun" : null;
}

function logUpdatePlan(result: UpdateAvailableResult): void {
  const plan = result.plan;
  console.log(
    `${chalk.bold("Latest")}: ${chalk.green(result.latestVersion)}\n${chalk.bold("Current")}: ${chalk.white(result.currentVersion)}\n${chalk.bold("Detected package manager")}: ${chalk.cyan(result.packageManager)}\n${chalk.bold("Update command")}: ${chalk.dim(`${plan.command} ${plan.args.join(" ")}`)}`
  );
}

function normalizeVersion(version: string): number[] {
  const coreVersion = version.trim().replace(/^v/i, "").split("-", 1)[0] ?? "0";
  return coreVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

async function fetchLatestVersion(packageName: string): Promise<string> {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    { headers: { accept: "application/json" } }
  );
  if (!response.ok) {
    throw new Error(
      `Unable to check for updates (${response.status} ${response.statusText})`
    );
  }
  const payload = (await response.json()) as { version?: unknown };
  if (typeof payload.version !== "string" || payload.version.length === 0) {
    throw new Error(
      "Received an invalid version payload from the npm registry"
    );
  }
  return payload.version;
}

async function isFormulaManaged(packageName: string): Promise<boolean> {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  const prefixResult = await runCommand("brew", ["--prefix", packageName]);
  if (prefixResult.exitCode !== 0 || !prefixResult.stdout.trim()) return false;
  const [resolvedEntryPoint, resolvedPrefix] = await Promise.all([
    realpath(entryPoint).catch(() => resolve(entryPoint)),
    realpath(prefixResult.stdout.trim()).catch(() =>
      resolve(prefixResult.stdout.trim())
    ),
  ]);
  return (
    resolvedEntryPoint === resolvedPrefix ||
    resolvedEntryPoint.startsWith(`${resolvedPrefix}${sep}`)
  );
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  const packageJson = await import("../../package.json");
  return {
    name: typeof packageJson.name === "string" ? packageJson.name : "squeezit",
    version:
      typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
  };
}
