import { Flags } from "@oclif/core";

import { confirmSelfUpdate } from "../../../utils/prompts";
import { SqueezitCommand } from "../../base-command";
import { requiresExplicitConfirmation, SqueezitError } from "../../output";
import { defaultUpdateService, runtimeRequest } from "./check";

export default class UpdateApply extends SqueezitCommand {
  static override description = "Apply the latest Squeezit update.";

  static override flags = {
    pm: Flags.option({
      description: "Installation source.",
      options: ["npm", "bun", "brew"] as const,
    })(),
    yes: Flags.boolean({
      char: "y",
      description: "Confirm update without a prompt.",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(UpdateApply);
    this.phaseStarted("confirmation", { operation: "update apply" });
    if (
      !flags.yes &&
      requiresExplicitConfirmation({
        machineOutput: this.machineOutputEnabled(),
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      throw new SqueezitError({
        code: "CONFIRMATION_REQUIRED",
        message:
          "--yes is required for update apply in JSON or non-interactive mode.",
        remediation:
          "Re-run with --yes after reviewing the selected update source.",
      });
    }
    this.phaseCompleted("confirmation", { approved: true });
    const service = defaultUpdateService();
    const request = runtimeRequest(flags.pm);
    this.phaseStarted("update-check");
    const checked = await service.check(request);
    this.phaseCompleted("update-check", { ok: checked.ok });
    this.phaseStarted("update-application");
    const result = await service.apply(
      request,
      async () => {
        if (flags.yes) return true;
        if (!checked.ok || !("packageManager" in checked)) return false;
        return confirmSelfUpdate(
          checked.packageManager,
          checked.currentVersion,
          checked.latestVersion
        );
      },
      checked
    );
    this.phaseCompleted(
      "update-application",
      result.ok ? { status: result.status } : { code: result.code }
    );
    const ok = result.ok && result.status !== "cancelled";
    process.exitCode = ok ? 0 : 1;
    const data = flags.verbose
      ? { ...result, diagnostics: ["Update apply completed."] }
      : result;
    if (this.jsonEnabled()) {
      return this.emitStatus(
        "update apply",
        ok,
        data,
        result.ok
          ? result.status === "cancelled"
            ? {
                code: "OPERATION_CANCELLED",
                message: "Self-update cancelled.",
                remediation:
                  "Re-run update apply and confirm the operation when prompted.",
              }
            : undefined
          : updateUnavailableIssue(result)
      );
    }
    if (!result.ok) this.error(result.message);
    this.log(
      result.status === "updated"
        ? "Squeezit updated."
        : result.status === "cancelled"
          ? "Self-update cancelled."
          : "Squeezit is already up to date."
    );
    if (flags.verbose) this.logToStderr("Update apply completed.");
    return data;
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
