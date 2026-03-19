import chalk from "chalk";
import ora from "ora";

import type { InstallerConfig, PackageManager } from "../types";
import {
  detectPackageManagerFromUserAgent,
  readInstallerConfig,
  writeInstallerConfig,
} from "./config";
import { runCheckedCommand } from "./exec";
import { confirmSelfUpdate } from "./prompts";

interface UpdateRequestOptions {
  performUpdate: boolean;
  overridePackageManager?: PackageManager | null;
}

interface PackageMetadata {
  name: string;
  version: string;
}

interface UpdatePlan {
  packageManager: PackageManager;
  command: string;
  args: string[];
}

export async function runSelfUpdate(
  options: UpdateRequestOptions
): Promise<void> {
  const metadata = await readPackageMetadata();
  const spinner = ora("Checking for updates").start();

  const latestVersion = await fetchLatestVersion(metadata.name);
  const comparison = compareVersions(latestVersion, metadata.version);

  if (comparison <= 0) {
    spinner.succeed(
      `${chalk.bold(metadata.name)} is up to date (${chalk.green(metadata.version)})`
    );
    return;
  }

  spinner.succeed(
    `Update available: ${chalk.white(metadata.version)} -> ${chalk.green(latestVersion)}`
  );

  const persistedConfig = await readInstallerConfig();
  const packageManager = resolvePackageManager({
    override: options.overridePackageManager ?? null,
    persistedConfig,
    userAgent: process.env.npm_config_user_agent,
    npmExecPath: process.env.npm_execpath,
    bunRuntime: Boolean(process.versions.bun),
  });

  if (!packageManager) {
    throw new Error(
      "Could not determine how squeezit was installed. Re-run with --pm npm or --pm bun."
    );
  }

  await persistInstaller(packageManager, metadata.name);

  if (!options.performUpdate) {
    const plan = createUpdatePlan(packageManager, metadata.name);
    console.log(
      `${chalk.bold("Latest")}: ${chalk.green(latestVersion)}\n${chalk.bold("Current")}: ${chalk.white(metadata.version)}\n${chalk.bold("Detected package manager")}: ${chalk.cyan(packageManager)}\n${chalk.bold("Update command")}: ${chalk.dim(`${plan.command} ${plan.args.join(" ")}`)}`
    );
    return;
  }

  const confirmed = await confirmSelfUpdate(
    packageManager,
    metadata.version,
    latestVersion
  );
  if (!confirmed) {
    console.log(chalk.yellow("Self-update cancelled."));
    return;
  }

  const plan = createUpdatePlan(packageManager, metadata.name);
  console.log(chalk.dim(`Updating with ${packageManager}...`));
  await runCheckedCommand(plan.command, plan.args, { stdio: "inherit" });
  console.log(
    chalk.green(
      `squeezit updated. Re-run ${packageManager === "npm" ? "squeezit --version" : "squeezit --version"} to verify the active installation.`
    )
  );
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
}): PackageManager | null {
  const { override, persistedConfig, userAgent, npmExecPath, bunRuntime } =
    params;

  if (override) {
    return override;
  }

  if (persistedConfig?.packageManager) {
    return persistedConfig.packageManager;
  }

  const fromUserAgent = detectPackageManagerFromUserAgent(userAgent);
  if (fromUserAgent) {
    return fromUserAgent;
  }

  const execPath = npmExecPath?.toLowerCase() ?? "";
  if (execPath.includes("bun")) {
    return "bun";
  }
  if (execPath.includes("npm")) {
    return "npm";
  }

  if (bunRuntime) {
    return "bun";
  }

  return null;
}

export function parsePackageManagerOption(value: string): PackageManager {
  const normalized = value.trim().toLowerCase();
  if (normalized === "npm" || normalized === "bun") {
    return normalized;
  }

  throw new Error("Package manager must be either npm or bun");
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
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
    {
      headers: {
        accept: "application/json",
      },
    }
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

async function persistInstaller(
  packageManager: PackageManager,
  packageName: string
): Promise<void> {
  await writeInstallerConfig({
    packageManager,
    packageName,
    updatedAt: new Date().toISOString(),
  });
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  const packageJson = await import("../../package.json");
  return {
    name: typeof packageJson.name === "string" ? packageJson.name : "squeezit",
    version:
      typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
  };
}
