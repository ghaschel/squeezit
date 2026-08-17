import { Args, Flags } from "@oclif/core";

import { SqueezitCommand } from "../../base-command";
import { SqueezitError } from "../../output";
import { preparePlanApply, runtimeSnapshot } from "../../plan-command";
import { optimizeResolvedInputs } from "../compress";

export default class PlanApply extends SqueezitCommand {
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
    if (!flags.yes) {
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        details: { command: "plan apply" },
        message: "--yes is required to apply a reviewed plan.",
        remediation:
          "Review the plan artifact, then re-run with --yes to apply exactly that plan.",
      });
    }

    const prepared = await preparePlanApply({
      path: args.plan,
      progress: flags.progress,
      runtime: runtimeSnapshot({ squeezitVersion: this.config.version }),
      verbose: flags.verbose,
    });
    if (!this.jsonEnabled()) {
      this.log(
        `Applying plan ${prepared.plan.planDigest} to ${prepared.inputs.length} input${prepared.inputs.length === 1 ? "" : "s"}.`
      );
    }

    const report = await optimizeResolvedInputs(
      prepared.inputs,
      prepared.options,
      "plan apply",
      this.jsonEnabled(),
      { assumeYes: true, confirm: async () => true },
      prepared.inputGuard
    );
    const data = { plan: prepared.plan, report };

    if (this.jsonEnabled()) {
      return this.emitStatus("plan apply", report.summary.failed === 0, data);
    }

    return data;
  }
}
