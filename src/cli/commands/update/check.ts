import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { Flags } from "@oclif/core";

import type { PackageManager } from "../../../types";
import {
  createUpdateService,
  readInstallerConfig,
  runCheckedCommand,
  writeInstallerConfig,
} from "../../../utils";
import { runCommand } from "../../../utils/exec";
import { SqueezitOperationCommand } from "../../operation-command";

export default class UpdateCheck extends SqueezitOperationCommand {
  static override description =
    "Check for a Squeezit update without changing installation state.";

  static override flags = {
    pm: Flags.option({
      description: "Installation source.",
      options: ["npm", "bun", "brew"] as const,
    })(),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(UpdateCheck);
    await this.beginReceipt(flags.receipt, "update check", { pm: flags.pm });
    this.phaseStarted("update-check");
    const result = await defaultUpdateService().check(runtimeRequest(flags.pm));
    this.phaseCompleted(
      "update-check",
      result.ok ? { status: result.status } : { code: result.code }
    );
    const ok = result.ok;
    process.exitCode = ok ? 0 : 1;
    const data = flags.verbose
      ? {
          ...result,
          diagnostics: [
            "Update check completed without changing installer state.",
          ],
        }
      : result;
    const issue = !result.ok ? updateUnavailableIssue(result) : undefined;
    const receiptData = await this.completeReceipt(data, {
      ...(issue ? { error: issue } : {}),
      exitCode: process.exitCode,
      ok,
    });
    if (this.jsonEnabled()) {
      return this.emitStatus("update check", ok, receiptData, issue);
    }
    if (!ok) this.error(result.message);
    if (result.status === "up-to-date")
      this.log(`Squeezit is up to date (${result.currentVersion}).`);
    else
      this.log(
        `Update available: ${result.currentVersion} -> ${result.latestVersion}\n${result.plan.command} ${result.plan.args.join(" ")}`
      );
    if (flags.verbose)
      this.logToStderr(
        "Update check completed without changing installer state."
      );
    return receiptData;
  }
}

function updateUnavailableIssue(result: { code: string; message: string }) {
  return {
    code: "UPDATE_UNAVAILABLE" as const,
    details: { updateCode: result.code },
    message: result.message,
    remediation:
      "Specify a valid installation source with --pm npm, --pm bun, or --pm brew.",
  };
}

export function defaultUpdateService() {
  return createUpdateService({
    fetchLatestVersion: async (packageName) => {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
      );
      if (!response.ok)
        throw new Error(`Unable to check for updates (${response.status})`);
      const payload = (await response.json()) as { version: string };
      return payload.version;
    },
    isFormulaManaged,
    now: () => new Date(),
    readInstallerConfig,
    readPackageMetadata: async () => {
      const packageJson = await import("../../../../package.json");
      return { name: packageJson.name, version: packageJson.version };
    },
    runCheckedCommand,
    writeInstallerConfig,
  });
}

async function isFormulaManaged(packageName: string): Promise<boolean> {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  const prefix = await runCommand("brew", ["--prefix", packageName]);
  if (prefix.exitCode !== 0 || !prefix.stdout.trim()) return false;
  const [binary, formulaPrefix] = await Promise.all([
    realpath(entryPoint).catch(() => resolve(entryPoint)),
    realpath(prefix.stdout.trim()).catch(() => resolve(prefix.stdout.trim())),
  ]);
  return (
    binary === formulaPrefix || binary.startsWith(`${formulaPrefix}${sep}`)
  );
}

export function runtimeRequest(overridePackageManager?: PackageManager) {
  return {
    overridePackageManager: overridePackageManager ?? null,
    userAgent: process.env.npm_config_user_agent,
    npmExecPath: process.env.npm_execpath,
    bunRuntime: Boolean(process.versions.bun),
  };
}
