import { Args, Flags } from "@oclif/core";

import { resolveCompressOptions } from "../../../utils";
import { SqueezitCommand } from "../../base-command";
import { createPlanArtifact, runtimeSnapshot } from "../../plan-command";

export default class PlanCompress extends SqueezitCommand {
  static override args = {
    patterns: Args.string({
      description:
        "Files, directories, or glob patterns to include in the plan.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Create a reviewable compression plan without changing images.";

  static override flags = {
    output: Flags.string({
      description: "Path for the new plan artifact.",
      required: true,
    }),
    recursive: Flags.boolean({
      char: "r",
      description: "Recurse into directories.",
    }),
    profile: Flags.option({
      description: "Optimization profile recorded in the plan.",
      default: "standard",
      options: ["standard", "max"] as const,
    })(),
    "strip-meta": Flags.boolean({
      description: "Remove EXIF/IPTC/XMP metadata when the plan is applied.",
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
    threshold: Flags.integer({
      min: 0,
      description: "Minimum bytes saved before replacement.",
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
    const { args, flags } = await this.parse(PlanCompress);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        concurrency: flags.concurrency,
        inPlace: flags["in-place"],
        keepTime: flags["keep-time"],
        profile: flags.profile,
        recursive: flags.recursive,
        stripMeta: flags["strip-meta"],
        threshold: flags.threshold,
        verbose: flags.verbose,
      },
      process.cwd()
    );
    const data = await createPlanArtifact({
      operation: "compress",
      options,
      output: flags.output,
      runtime: runtimeSnapshot({ squeezitVersion: this.config.version }),
    });

    if (this.jsonEnabled()) return this.emit("plan compress", data);

    this.log(
      `Created compression plan for ${data.plan.inputs.length} input${data.plan.inputs.length === 1 ? "" : "s"}: ${data.output.path}`
    );
    this.log(`Plan digest: ${data.plan.planDigest}`);
    return data;
  }
}
