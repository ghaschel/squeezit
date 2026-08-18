import { Args, Flags } from "@oclif/core";

import {
  collectDependencyInstallTargets,
  collectRequiredDependencies,
  detectPlatform,
  diagnoseDependencies,
  findMissingDependencies,
  formatDependencyInstallCommand,
  installDependencies,
  resolveCompressOptions,
  resolveInputs,
} from "../../../utils";
import { confirmDependencyInstall } from "../../../utils/prompts";
import { SqueezitOperationCommand } from "../../operation-command";
import { requiresExplicitConfirmation, SqueezitError } from "../../output";

export default class DependenciesInstall extends SqueezitOperationCommand {
  static override args = {
    patterns: Args.string({
      description: "Install only tools required by these image inputs.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Install missing optimizer tools for all or selected image formats.";

  static override flags = {
    recursive: Flags.boolean({
      char: "r",
      description: "Recurse into directories.",
    }),
    profile: Flags.option({
      description: "Include tools needed for this optimization profile.",
      default: "standard",
      options: ["standard", "max"] as const,
    })(),
    "strip-meta": Flags.boolean({
      description: "Include metadata stripping tools.",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Confirm installation without a prompt.",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(DependenciesInstall);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        profile: flags.profile,
        recursive: flags.recursive,
        stripMeta: flags["strip-meta"],
        verbose: flags.verbose,
      },
      process.cwd()
    );
    await this.beginReceipt(flags.receipt, "deps install", {
      profile: flags.profile,
      recursive: Boolean(flags.recursive),
      stripMeta: Boolean(flags["strip-meta"]),
    });
    const platform = await detectPlatform();
    if (!platform) {
      throw new SqueezitError({
        code: "UNSUPPORTED_PLATFORM",
        details: { platform: process.platform },
        message: "squeezit supports macOS and Debian/Ubuntu Linux only.",
        remediation: "Run Squeezit on macOS or Debian/Ubuntu Linux.",
      });
    }

    this.phaseStarted("input-discovery");
    const inputs = await resolveInputs(options);
    this.phaseCompleted("input-discovery", { inputs: inputs.length });
    const dependencies = collectRequiredDependencies(
      inputs,
      options,
      (args.patterns?.length ?? 0) === 0
    );
    await this.receiptPrepareInputs(inputs);
    this.phaseStarted("dependency-validation");
    const missing = await findMissingDependencies(dependencies);
    await this.receiptSetToolsBefore(await diagnoseDependencies(dependencies));
    const targets = collectDependencyInstallTargets(missing, platform);
    const packages = Array.from(
      new Set(targets.map((target) => target.package))
    );
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
    this.phaseCompleted("dependency-validation", { missing: missing.length });

    if (missing.length === 0) {
      const data = {
        inputs: inputs.length,
        packages: [],
        installTargets: [],
        installed: false,
        missing: [],
      };
      if (flags.verbose && !this.jsonEnabled()) {
        this.logToStderr(
          "All requested optimizer tools are already installed."
        );
      }
      await this.receiptObserveInputs(inputs);
      const receiptData = await this.completeReceipt(data, { ok: true });
      return this.jsonEnabled()
        ? this.emit("deps install", receiptData)
        : receiptData;
    }

    if (
      !flags.yes &&
      requiresExplicitConfirmation({
        machineOutput: this.machineOutputEnabled(),
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      this.phaseStarted("confirmation", { operation: "deps install" });
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        message:
          "--yes is required for dependency installation in JSON or non-interactive mode.",
        remediation:
          "Re-run with --yes after reviewing the packages that will be installed.",
      });
    }

    this.phaseStarted("confirmation", { operation: "deps install" });
    const confirmed =
      flags.yes ||
      (await confirmDependencyInstall(platform, packages, installers));
    if (!confirmed) {
      throw new SqueezitError({
        code: "OPERATION_CANCELLED",
        message: "Dependency installation cancelled.",
        remediation:
          "Re-run sqz deps install and confirm the operation when prompted.",
      });
    }
    this.phaseCompleted("confirmation", { approved: true });

    if (flags.verbose && !this.jsonEnabled()) {
      this.logToStderr(
        `Installing ${formatDependencyInstallCommand(platform, targets).join("; ")}`
      );
    }
    this.phaseStarted("dependency-installation", { packages });
    await installDependencies(platform, targets);
    await this.receiptSetToolsAfter(await diagnoseDependencies(dependencies));
    await this.receiptObserveInputs(inputs);
    this.phaseCompleted("dependency-installation", { packages });
    const data = {
      inputs: inputs.length,
      packages,
      installTargets: targets,
      installed: true,
      missing: missing.map((dependency) => dependency.binary),
      ...(flags.verbose
        ? { diagnostics: [`Installed ${packages.length} package(s).`] }
        : {}),
    };
    const receiptData = await this.completeReceipt(data, { ok: true });
    return this.jsonEnabled()
      ? this.emit("deps install", receiptData)
      : receiptData;
  }
}
