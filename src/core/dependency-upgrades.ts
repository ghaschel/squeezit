import { realpath } from "node:fs/promises";
import { basename, join } from "node:path";

import nativeTargets from "../../scripts/native-tool-targets.json";
import type { DependencySpec } from "../types";
import { runCommand } from "../utils/exec";
import {
  compareDependencyVersions,
  DEPENDENCY_CATALOG,
  type DependencyCommandRunner,
  type DependencyDiagnostic,
  type DependencyDiagnosticOptions,
  type DependencyName,
  diagnoseDependencies,
  type SupportedPlatform,
} from "./dependencies";

export interface DependencyUpgradeTool extends DependencyDiagnostic {
  targetVersion: string;
  targetStatus: "current" | "missing" | "outdated" | "unverifiable";
}

export interface DependencyUpgradeCommand {
  command: string;
  args: string[];
}

export interface DependencyUpgradePlan {
  commands: DependencyUpgradeCommand[];
  blocked: DependencyUpgradeTool[];
}

export function assessDependencyUpgradeTargets(
  diagnostics: DependencyDiagnostic[]
): DependencyUpgradeTool[] {
  return diagnostics.map((tool) => {
    const dependency = DEPENDENCY_CATALOG[tool.binary as DependencyName];
    const targetVersion =
      tool.binary === "file"
        ? dependency.minimumVersion
        : nativeTargets[dependency.brewPackage as keyof typeof nativeTargets]
            .version;
    const version = tool.normalizedVersion;
    const targetStatus = !tool.present
      ? "missing"
      : tool.status === "unverifiable" ||
          !version ||
          !/^\d+(?:\.\d+)+(?:-\d+)?(?:_\d+)?$/.test(version)
        ? "unverifiable"
        : compareDependencyVersions(version, targetVersion) >= 0
          ? "current"
          : "outdated";
    return {
      ...tool,
      targetVersion,
      targetStatus,
      remediation:
        targetStatus === "current"
          ? ""
          : `Require ${tool.binary} >=${targetVersion}. ${tool.remediation || "Upgrade its package and check the executable selected by PATH."}`,
    };
  });
}

/** The source manifest is bundled into the CLI; it need not ship as a script. */
export async function inspectDependencyUpgrades(
  dependencies: DependencySpec[],
  options: DependencyDiagnosticOptions & {
    realpath?: (path: string) => Promise<string>;
  } = {}
): Promise<DependencyUpgradeTool[]> {
  const diagnostics = await diagnoseDependencies(dependencies, {
    ...options,
    strictBinaryVersion: true,
  });
  const runner = options.runCommand ?? runCommand;
  const resolvePath = options.realpath ?? realpath;

  // Provider-only versions must belong to the executable actually selected by PATH.
  // A recent package receipt cannot prove that a shadowing standalone binary is recent.
  for (const tool of diagnostics) {
    const dependency = DEPENDENCY_CATALOG[tool.binary as DependencyName];
    if (!tool.present || dependency.versionReporting !== "provider") continue;
    let owned = false;
    try {
      const selected = await runner("which", [tool.binary]);
      if (selected.exitCode === 0) {
        const selectedPath = await resolvePath(selected.stdout.trim());
        if (tool.provider === "brew" && dependency.brewPackage) {
          const prefix = await runner("brew", [
            "--prefix",
            dependency.brewPackage,
          ]);
          if (prefix.exitCode === 0) {
            const resolvedPrefix = await resolvePath(prefix.stdout.trim());
            const kegVersion = basename(resolvedPrefix);
            owned =
              /^\d+(?:\.\d+)+(?:-\d+)?(?:_\d+)?$/.test(kegVersion) &&
              selectedPath ===
                (await resolvePath(join(resolvedPrefix, "bin", tool.binary)));
            // Homebrew may retain older kegs. Only the active, resolved keg
            // establishes the provider-only version of this executable.
            if (owned) {
              tool.rawVersion = kegVersion;
              tool.normalizedVersion = kegVersion.replace(/_\d+$/, "");
              if (tool.status !== "unverifiable")
                tool.status =
                  compareDependencyVersions(
                    tool.normalizedVersion,
                    tool.minimumVersion
                  ) >= 0
                    ? "healthy"
                    : "outdated";
            }
          }
        } else if (tool.provider === "apt" && dependency.aptPackage) {
          const files = await runner("dpkg-query", [
            "-L",
            dependency.aptPackage,
          ]);
          for (const path of files.stdout.split("\n")) {
            if (files.exitCode === 0 && path.endsWith(`/bin/${tool.binary}`)) {
              owned = selectedPath === (await resolvePath(path));
              if (owned) break;
            }
          }
        }
      }
    } catch {
      // A missing/ambiguous provider path is inconclusive, not a target match.
    }
    if (!owned) {
      tool.status = "unverifiable";
      tool.remediation = `Ensure PATH selects ${tool.binary} from its verified package provider.`;
    }
  }
  return assessDependencyUpgradeTargets(diagnostics);
}

export async function planDependencyUpgrades(
  platform: SupportedPlatform,
  tools: DependencyUpgradeTool[],
  options: {
    runCommand?: DependencyCommandRunner;
    nonInteractive?: boolean;
  } = {}
): Promise<DependencyUpgradePlan> {
  const runner = options.runCommand ?? runCommand;
  const commands: DependencyUpgradeCommand[] = [];
  const blocked: DependencyUpgradeTool[] = [];
  const packages = new Set<string>();
  const aptPackages: string[] = [];
  const cargoCommands: DependencyUpgradeCommand[] = [];
  for (const tool of tools) {
    if (tool.targetStatus === "current") continue;
    const dependency = DEPENDENCY_CATALOG[tool.binary as DependencyName];
    if (platform === "macos" && dependency.brewPackage) {
      if (packages.has(dependency.brewPackage)) continue;
      packages.add(dependency.brewPackage);
      const installed = await runner("brew", [
        "list",
        "--versions",
        "--formula",
        dependency.brewPackage,
      ]);
      commands.push({
        command: "brew",
        args: [
          installed.exitCode === 0 && installed.stdout.trim()
            ? "upgrade"
            : "install",
          "--formula",
          "--no-ask",
          dependency.brewPackage,
        ],
      });
    } else if (platform === "debian" && dependency.aptPackage) {
      if (!aptPackages.includes(dependency.aptPackage))
        aptPackages.push(dependency.aptPackage);
    } else if (platform === "debian" && dependency.cargoPackage) {
      if (packages.has(dependency.cargoPackage.crate)) continue;
      packages.add(dependency.cargoPackage.crate);
      cargoCommands.push({
        command: "cargo",
        args: [
          "install",
          dependency.cargoPackage.crate,
          "--version",
          tool.targetVersion,
          "--locked",
        ],
      });
    } else {
      blocked.push({
        ...tool,
        remediation:
          platform === "macos" && dependency.systemProvided
            ? `Update macOS to provide ${tool.binary} >=${tool.targetVersion}, and check PATH. Squeezit does not replace system tools.`
            : `Install ${tool.binary} >=${tool.targetVersion} manually. ${dependency.manualInstall ?? "No automatic provider is configured."}`,
      });
    }
  }
  if (aptPackages.length) {
    const prefix = options.nonInteractive ? ["-n"] : [];
    commands.push(
      { command: "sudo", args: [...prefix, "apt-get", "update"] },
      {
        command: "sudo",
        args: [
          ...prefix,
          "apt-get",
          "install",
          "--yes",
          "--no-remove",
          ...aptPackages,
        ],
      }
    );
  }
  commands.push(...cargoCommands);
  return { commands, blocked };
}

export async function executeDependencyUpgradePlan(
  plan: DependencyUpgradePlan,
  options: {
    inspect: () => Promise<DependencyUpgradeTool[]>;
    runCommand?: DependencyCommandRunner;
    onCommand?: (command: DependencyUpgradeCommand) => void;
  }
): Promise<{
  ok: boolean;
  executed: Array<
    DependencyUpgradeCommand & {
      exitCode: number;
      output?: string;
      error?: string;
    }
  >;
  toolsAfter: DependencyUpgradeTool[];
}> {
  const runner = options.runCommand ?? runCommand;
  const executed: Array<
    DependencyUpgradeCommand & {
      exitCode: number;
      output?: string;
      error?: string;
    }
  > = [];
  for (const command of plan.commands) {
    options.onCommand?.(command);
    try {
      const result = await runner(command.command, command.args);
      executed.push({
        ...command,
        exitCode: result.exitCode,
        output: result.all.trim(),
        ...(result.exitCode !== 0
          ? { error: result.all.trim() || "Package manager failed." }
          : {}),
      });
      if (result.exitCode !== 0) break;
    } catch (error) {
      executed.push({
        ...command,
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  const toolsAfter = await options.inspect();
  return {
    ok:
      executed.every((result) => result.exitCode === 0) &&
      toolsAfter.every((tool) => tool.targetStatus === "current"),
    executed,
    toolsAfter,
  };
}
