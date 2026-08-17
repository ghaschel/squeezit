import { Args, Flags } from "@oclif/core";

import { resolveCompressOptions } from "../../../../utils";
import { SqueezitCommand } from "../../../base-command";
import { createPlanArtifact, runtimeSnapshot } from "../../../plan-command";

export default class PlanMetadataStrip extends SqueezitCommand {
  static override aliases = ["plan:exif"];

  static override args = {
    patterns: Args.string({
      description:
        "Files, directories, or glob patterns whose metadata should be removed.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Create a reviewable metadata-removal plan without changing images.";

  static override flags = {
    output: Flags.string({
      description: "Path for the new plan artifact.",
      required: true,
    }),
    recursive: Flags.boolean({
      char: "r",
      description: "Recurse into directories.",
    }),
    "keep-time": Flags.boolean({
      char: "k",
      description: "Preserve original atime/mtime when the plan is applied.",
    }),
    concurrency: Flags.integer({
      char: "c",
      min: 1,
      description: "Concurrent workers recorded in the plan.",
    }),
    "in-place": Flags.boolean({
      description:
        "Create temporary artifacts next to source files when applying.",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(PlanMetadataStrip);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        concurrency: flags.concurrency,
        exif: true,
        inPlace: flags["in-place"],
        keepTime: flags["keep-time"],
        recursive: flags.recursive,
        verbose: flags.verbose,
      },
      process.cwd()
    );
    const data = await createPlanArtifact({
      operation: "metadata strip",
      options,
      events: this.eventReporter(),
      output: flags.output,
      runtime: runtimeSnapshot({ squeezitVersion: this.config.version }),
    });

    if (this.machineOutputEnabled())
      return this.emit("plan metadata strip", data);

    this.log(
      `Created metadata plan for ${data.plan.inputs.length} input${data.plan.inputs.length === 1 ? "" : "s"}: ${data.output.path}`
    );
    this.log(`Plan digest: ${data.plan.planDigest}`);
    return data;
  }
}
