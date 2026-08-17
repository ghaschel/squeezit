import { Args, Flags } from "@oclif/core";

import { resolveCompressOptions } from "../../../utils";
import { confirmImageOptimization } from "../../../utils/prompts";
import { SqueezitCommand } from "../../base-command";
import { optimizeCommand } from "../compress";

export default class MetadataStrip extends SqueezitCommand {
  static override aliases = ["exif"];

  static override args = {
    patterns: Args.string({
      description:
        "Files, directories, or glob patterns whose metadata should be removed.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Remove EXIF/IPTC/XMP metadata without recompressing images.";

  static override flags = {
    recursive: Flags.boolean({
      char: "r",
      description: "Recurse into directories.",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description: "Report changes without modifying files.",
    }),
    "keep-time": Flags.boolean({
      char: "k",
      description: "Preserve original atime/mtime.",
    }),
    concurrency: Flags.integer({
      char: "c",
      min: 1,
      description: "Concurrent workers.",
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
    yes: Flags.boolean({
      char: "y",
      description: "Confirm image changes without a prompt.",
    }),
    "in-place": Flags.boolean({
      description: "Create temporary artifacts next to source files.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(MetadataStrip);
    const options = resolveCompressOptions(
      args.patterns ?? [],
      {
        concurrency: flags.concurrency,
        dryRun: flags["dry-run"],
        exif: true,
        inPlace: flags["in-place"],
        keepTime: flags["keep-time"],
        progress: flags.progress,
        recursive: flags.recursive,
        verbose: flags.verbose,
      },
      process.cwd()
    );
    const report = await optimizeCommand(
      options,
      "metadata strip",
      this.machineOutputEnabled(),
      {
        assumeYes: flags.yes,
        confirm: (inputCount) =>
          confirmImageOptimization("metadata strip", inputCount),
      },
      this.eventReporter()
    );

    if (this.jsonEnabled()) {
      return this.emitStatus(
        "metadata strip",
        report.summary.failed === 0,
        report
      );
    }

    return report;
  }
}
