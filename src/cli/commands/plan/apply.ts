import { resolve } from "node:path";

import { Args, Flags } from "@oclif/core";

import { SqueezitOperationCommand } from "../../operation-command";
import { SqueezitError } from "../../output";
import { preparePlanApply, runtimeSnapshot } from "../../plan-command";
import { optimizeResolvedInputs, receiptOptions } from "../compress";

export default class PlanApply extends SqueezitOperationCommand {
  static override args = {
    plan: Args.string({
      description: "Path to the reviewed Squeezit optimization plan.",
      required: true,
    }),
  };

  static override description =
    "Apply a reviewed plan after verifying its files, runtime, and toolchain.";

  static override flags = {
    yes: Flags.boolean({
      char: "y",
      description: "Confirm application of the reviewed plan.",
    }),
    progress: Flags.option({
      description: "Progress display mode.",
      default: "auto",
      options: ["auto", "off"] as const,
    })(),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(PlanApply);
    const planPath = resolve(args.plan);
    await this.beginReceipt(flags.receipt, "plan apply", {
      plan: planPath,
    });
    this.phaseStarted("confirmation", { operation: "plan apply" });
    if (!flags.yes) {
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        details: { command: "plan apply" },
        message: "--yes is required to apply a reviewed plan.",
        remediation:
          "Review the plan artifact, then re-run with --yes to apply exactly that plan.",
      });
    }
    this.phaseCompleted("confirmation", { approved: true });

    this.phaseStarted("plan-validation");
    const prepared = await preparePlanApply({
      events: this.eventReporter(),
      path: planPath,
      progress: flags.progress,
      runtime: runtimeSnapshot({ squeezitVersion: this.config.version }),
      verbose: flags.verbose,
    });
    this.phaseCompleted("plan-validation", { inputs: prepared.inputs.length });
    await this.receiptSetOptions({
      ...receiptOptions(prepared.options),
      plan: planPath,
      planDigest: prepared.plan.planDigest,
    });
    await this.receiptPrepareInputs(prepared.inputs);
    if (!this.machineOutputEnabled()) {
      this.log(
        `Applying plan ${prepared.plan.planDigest} to ${prepared.inputs.length} input${prepared.inputs.length === 1 ? "" : "s"}.`
      );
    }

    const report = await optimizeResolvedInputs(
      prepared.inputs,
      prepared.options,
      "plan apply",
      this.machineOutputEnabled(),
      { assumeYes: true, confirm: async () => true },
      prepared.inputGuard,
      this.eventReporter(),
      {
        lifecycle: this.receiptLifecycle(),
        onToolsValidated: (tools) => this.receiptSetToolsBefore(tools),
      }
    );
    const data = await this.completeReceipt(
      { plan: prepared.plan, report },
      {
        exitCode: report.summary.failed === 0 ? 0 : 1,
        ok: report.summary.failed === 0,
      }
    );

    if (this.machineOutputEnabled()) {
      return this.emitStatus("plan apply", report.summary.failed === 0, data);
    }

    return data;
  }
}
