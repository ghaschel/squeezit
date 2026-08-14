import chalk from "chalk";
import ora from "ora";

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
    throw new Error("squeezit supports macOS and Debian/Ubuntu Linux only.");
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
    throw new Error(
      `${buildMissingDependencyMessage(missing, platform)}\nInstall with ${chalk.cyan("sqz deps install")} or install these packages manually.`
    );
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
    throw new Error("Dependency installation cancelled.");
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
    throw new Error(
      `${buildMissingDependencyMessage(missing, platform)}\nInstall with ${chalk.cyan("sqz deps install")} or install these packages manually.`
    );
  }

  spinner?.succeed("System tools are available");
}
