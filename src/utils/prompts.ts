import { confirm } from "@inquirer/prompts";

import type { PackageManager } from "../types";

export async function confirmDependencyInstall(
  platform: "macos" | "debian",
  packages: string[]
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const packageManager = platform === "macos" ? "Homebrew" : "APT";
  return confirm({
    default: true,
    message: `Install ${packages.length} missing package${packages.length === 1 ? "" : "s"} with ${packageManager}?`,
  });
}

export async function confirmSelfUpdate(
  packageManager: PackageManager,
  currentVersion: string,
  latestVersion: string
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  return confirm({
    default: true,
    message: `Update squeezit from ${currentVersion} to ${latestVersion} using ${packageManager}?`,
  });
}
