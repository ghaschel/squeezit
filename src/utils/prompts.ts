import inquirer from "inquirer";

import type { PackageManager } from "../types";

export async function confirmDependencyInstall(
  platform: "macos" | "debian",
  packages: string[]
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const packageManager = platform === "macos" ? "Homebrew" : "APT";
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      default: true,
      message: `Install ${packages.length} missing package${packages.length === 1 ? "" : "s"} with ${packageManager}?`,
    },
  ]);

  return confirmed;
}

export async function confirmSelfUpdate(
  packageManager: PackageManager,
  currentVersion: string,
  latestVersion: string
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      default: true,
      message: `Update squeezit from ${currentVersion} to ${latestVersion} using ${packageManager}?`,
    },
  ]);

  return confirmed;
}
