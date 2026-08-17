import chalk from "chalk";
import ora from "ora";

import { SqueezitError } from "../cli/output";
import {
  buildMissingDependencyMessage,
  collectDependencyInstallTargets,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  installDependencies,
} from "../core";
import type { CompressCommandOptions, ResolvedInput } from "../types";
import { confirmDependencyInstall } from "./prompts";

export {
  buildMissingDependencyMessage,
  collectDependencyInstallTargets,
  collectRequiredDependencies,
  compareDependencyVersions,
  DEPENDENCY_CATALOG,
  detectPlatform,
  diagnoseDependencies,
  diagnoseDependency,
  findMissingDependencies,
  formatDependencyInstallCommand,
  installDependencies,
  normalizeDependencyVersion,
  resolveMozjpegBinary,
} from "../core";

export async function ensureDependencies(
  options: CompressCommandOptions,
  inputs: ResolvedInput[],
  output: { silent?: boolean } = {}
): Promise<void> {
  const spinner = output.silent
    ? null
    : ora("Checking required system tools").start();
  const platform = await detectPlatform();

  if (!platform) {
    spinner?.fail("Unsupported OS");
    throw new SqueezitError({
      code: "UNSUPPORTED_PLATFORM",
      details: { platform: process.platform },
      message: "squeezit supports macOS and Debian/Ubuntu Linux only.",
      remediation: "Run Squeezit on macOS or Debian/Ubuntu Linux.",
    });
  }

  const dependencies = collectRequiredDependencies(
    inputs,
    options,
    options.installDeps
  );
  let missing = await findMissingDependencies(dependencies);

  if (missing.length === 0) {
    spinner?.succeed("System tools are available");
    return;
  }

  if (!options.installDeps) {
    spinner?.fail("Missing required system tools");
    throw missingDependenciesError(missing, platform);
  }

  const targets = collectDependencyInstallTargets(missing, platform);
  const packages = Array.from(new Set(targets.map((target) => target.package)));
  const installers = Array.from(
    new Set(
      targets.map((target) =>
        target.installer === "brew"
          ? "Homebrew"
          : target.installer === "apt"
            ? "APT"
            : "Cargo"
      )
    )
  );
  spinner?.stop();

  const confirmed = await confirmDependencyInstall(
    platform,
    packages,
    installers
  );
  if (!confirmed) {
    throw new SqueezitError({
      code: "OPERATION_CANCELLED",
      message: "Dependency installation cancelled.",
      remediation:
        "Re-run sqz deps install and confirm the operation when prompted.",
    });
  }

  spinner?.start(
    `Installing ${packages.length} tool${packages.length === 1 ? "" : "s"}`
  );
  spinner?.stop();
  await installDependencies(platform, targets);
  spinner?.start("Re-checking required system tools");

  missing = await findMissingDependencies(dependencies);
  if (missing.length > 0) {
    spinner?.fail("Dependencies are still missing after installation");
    throw missingDependenciesError(missing, platform);
  }

  spinner?.succeed("System tools are available");
}

function missingDependenciesError(
  missing: Awaited<ReturnType<typeof findMissingDependencies>>,
  platform: Awaited<ReturnType<typeof detectPlatform>>
): SqueezitError {
  return new SqueezitError({
    code: "DEPENDENCY_MISSING",
    details: {
      binaries: missing.map((dependency) => dependency.binary),
      platform,
    },
    message: `${buildMissingDependencyMessage(missing, platform)}\nInstall with ${chalk.cyan("sqz deps install")} or install these packages manually.`,
    remediation:
      "Install the missing tools with sqz deps install, then retry the command.",
  });
}
