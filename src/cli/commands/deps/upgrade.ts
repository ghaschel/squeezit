import { confirm } from "@inquirer/prompts";
import { Args, Flags } from "@oclif/core";

import {
  executeDependencyUpgradePlan,
  inspectDependencyUpgrades,
  planDependencyUpgrades,
} from "../../../core/dependency-upgrades";
import {
  collectRequiredDependencies,
  detectPlatform,
  resolveCompressOptions,
  resolveInputs,
} from "../../../utils";
import { SqueezitOperationCommand } from "../../operation-command";
import { requiresExplicitConfirmation, SqueezitError } from "../../output";

export default class DependenciesUpgrade extends SqueezitOperationCommand {
  static override args = {
    patterns: Args.string({
      description: "Upgrade only tools required by these image or PDF inputs.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Install or upgrade optimizer tools to at least the tested target versions.";

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
      description: "Include image metadata stripping tools.",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description:
        "Show target versions and package commands without installing or upgrading.",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Confirm dependency changes without a prompt.",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Include diagnostic details.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(DependenciesUpgrade);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        profile: flags.profile,
        recursive: flags.recursive,
        stripMeta: flags["strip-meta"],
      },
      process.cwd()
    );
    const dryRun = Boolean(flags["dry-run"]);
    await this.beginReceipt(flags.receipt, "deps upgrade", {
      profile: flags.profile,
      recursive: Boolean(flags.recursive),
      stripMeta: Boolean(flags["strip-meta"]),
      dryRun,
    });
    const platform = await detectPlatform();
    if (!platform)
      throw new SqueezitError({
        code: "UNSUPPORTED_PLATFORM",
        message:
          "Dependency upgrades support macOS and Debian/Ubuntu Linux only.",
        remediation: "Run Squeezit on macOS or Debian/Ubuntu Linux.",
      });

    this.phaseStarted("input-discovery");
    const inputs = await resolveInputs(options);
    await this.receiptPrepareInputs(inputs);
    this.phaseCompleted("input-discovery", { inputs: inputs.length });
    const fullScope = (args.patterns?.length ?? 0) === 0;
    const dependencies = collectRequiredDependencies(
      inputs,
      options,
      fullScope
    );
    const inspect = () => inspectDependencyUpgrades(dependencies, { platform });
    this.phaseStarted("dependency-validation");
    const toolsBefore = await inspect();
    await this.receiptSetToolsBefore(toolsBefore);
    const nonInteractive = requiresExplicitConfirmation({
      machineOutput: this.machineOutputEnabled(),
      isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    });
    const plan = await planDependencyUpgrades(platform, toolsBefore, {
      nonInteractive,
    });
    this.phaseCompleted("dependency-validation", { tools: toolsBefore.length });

    if (!this.machineOutputEnabled()) {
      for (const tool of toolsBefore)
        this.log(
          `${tool.binary}: ${tool.rawVersion ?? tool.normalizedVersion ?? tool.status} → target >=${tool.targetVersion} (${tool.targetStatus})`
        );
      for (const command of plan.commands)
        this.log(`  ${command.command} ${command.args.join(" ")}`);
      for (const tool of plan.blocked)
        this.logToStderr(`  ${tool.remediation}`);
    }

    if (!dryRun && plan.commands.length > 0) {
      this.phaseStarted("confirmation", { operation: "deps upgrade" });
      if (!flags.yes && nonInteractive)
        throw new SqueezitError({
          code: "CONFIRMATION_REQUIRED",
          message:
            "--yes is required for dependency upgrades in JSON or non-interactive mode.",
          remediation:
            "Review sqz deps upgrade --dry-run, then re-run with --yes.",
          details: {
            commands: plan.commands,
            blocked: plan.blocked,
            tools: toolsBefore,
          },
        });
      const approved =
        flags.yes ||
        (await confirm({
          default: false,
          message: `Run ${plan.commands.length} package command(s) to meet these dependency targets?`,
        }));
      if (!approved)
        throw new SqueezitError({
          code: "OPERATION_CANCELLED",
          message: "Dependency upgrade cancelled.",
          remediation: "Review sqz deps upgrade --dry-run before trying again.",
        });
      this.phaseCompleted("confirmation", { approved: true });
    }

    this.phaseStarted(dryRun ? "upgrade-preview" : "dependency-upgrade");
    const execution = dryRun
      ? { ok: true, toolsAfter: toolsBefore, executed: [] }
      : await executeDependencyUpgradePlan(plan, {
          inspect,
          onCommand: (command) => {
            if (!this.machineOutputEnabled())
              this.logToStderr(
                `Running ${command.command} ${command.args.join(" ")}…`
              );
          },
        });
    if (!dryRun) await this.receiptSetToolsAfter(execution.toolsAfter);
    if (!this.machineOutputEnabled()) {
      for (const command of execution.executed)
        if (command.output) this.logToStderr(command.output);
    }
    await this.receiptObserveInputs(inputs);
    this.phaseCompleted(dryRun ? "upgrade-preview" : "dependency-upgrade");
    const ready = execution.toolsAfter.every(
      (tool) => tool.targetStatus === "current"
    );
    const ok = dryRun || execution.ok;
    const error = ok
      ? undefined
      : {
          code: "DEPENDENCY_UPGRADE_FAILED" as const,
          message:
            "Dependency upgrade did not meet every target or a package command failed.",
          remediation:
            "Review unmet tools and command errors. Check PATH, pinned packages, provider availability, and manual installation instructions, then retry.",
        };
    const data = {
      scope: fullScope ? "full" : "selected-inputs",
      inputs: inputs.length,
      dryRun,
      ready,
      attempted: execution.executed.length > 0,
      commands: plan.commands,
      blocked: plan.blocked,
      toolsBefore,
      toolsAfter: execution.toolsAfter,
      executed: execution.executed,
      ...(flags.verbose
        ? {
            diagnostics: [
              `Checked ${toolsBefore.length} tools against bundled upstream targets; newer versions are retained.`,
            ],
          }
        : {}),
    };
    process.exitCode = ok ? 0 : 1;
    const receiptData = await this.completeReceipt(data, {
      ok,
      error,
      exitCode: process.exitCode,
    });
    if (this.jsonEnabled())
      return this.emitStatus("deps upgrade", ok, receiptData, error);
    if (dryRun) this.log("Dry run: no dependency changes made.");
    else if (ok) this.log("All requested dependency targets are satisfied.");
    else {
      for (const tool of execution.toolsAfter.filter(
        (tool) => tool.targetStatus !== "current"
      )) {
        this.logToStderr(
          `${tool.binary}: ${tool.targetStatus}; ${tool.remediation}`
        );
      }
      for (const command of execution.executed.filter(
        (command) => command.exitCode !== 0
      ))
        this.logToStderr(command.error ?? "Package command failed.");
    }
    return receiptData;
  }
}
