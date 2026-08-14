import { Args, Flags } from "@oclif/core";

import {
  collectDependencyInstallTargets,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  formatDependencyInstallCommand,
  installDependencies,
  resolveCompressOptions,
  resolveInputs,
} from "../../../utils";
import { confirmDependencyInstall } from "../../../utils/prompts";
import { SqueezitCommand } from "../../base-command";
import { requiresExplicitConfirmation } from "../../output";

export default class DependenciesInstall extends SqueezitCommand {
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
    const platform = await detectPlatform();
    if (!platform) {
      this.error("squeezit supports macOS and Debian/Ubuntu Linux only.");
    }

    const inputs = await resolveInputs(options);
    const dependencies = collectRequiredDependencies(
      inputs,
      options,
      (args.patterns?.length ?? 0) === 0
    );
    const missing = await findMissingDependencies(dependencies);
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
      return this.jsonEnabled() ? this.emit("deps install", data) : data;
    }

    if (
      !flags.yes &&
      requiresExplicitConfirmation({
        json: this.jsonEnabled(),
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      this.error(
        "--yes is required for dependency installation in JSON or non-interactive mode."
      );
    }

    const confirmed =
      flags.yes ||
      (await confirmDependencyInstall(platform, packages, installers));
    if (!confirmed) {
      this.error("Dependency installation cancelled.");
    }

    if (flags.verbose && !this.jsonEnabled()) {
      this.logToStderr(
        `Installing ${formatDependencyInstallCommand(platform, targets).join("; ")}`
      );
    }
    await installDependencies(platform, targets);
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
    return this.jsonEnabled() ? this.emit("deps install", data) : data;
  }
}
