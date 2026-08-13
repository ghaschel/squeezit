import { Flags } from "@oclif/core";

import { confirmSelfUpdate } from "../../../utils/prompts";
import { SqueezitCommand } from "../../base-command";
import { requiresExplicitConfirmation } from "../../output";
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
    if (
      !flags.yes &&
      requiresExplicitConfirmation({
        json: this.jsonEnabled(),
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
    ) {
      this.error(
        "--yes is required for update apply in JSON or non-interactive mode."
      );
    }
    const service = defaultUpdateService();
    const request = runtimeRequest(flags.pm);
    const checked = await service.check(request);
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
    const ok = result.ok && result.status !== "cancelled";
    process.exitCode = ok ? 0 : 1;
    const data = flags.verbose
      ? { ...result, diagnostics: ["Update apply completed."] }
      : result;
    if (this.jsonEnabled())
      return { schemaVersion: 1, command: "update apply", ok, data };
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
