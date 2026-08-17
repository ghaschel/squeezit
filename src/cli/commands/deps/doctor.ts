import { Args, Flags } from "@oclif/core";

import {
  collectRequiredDependencies,
  diagnoseDependencies,
  resolveCompressOptions,
  resolveInputs,
} from "../../../utils";
import { SqueezitCommand } from "../../base-command";

export default class DependenciesDoctor extends SqueezitCommand {
  static override args = {
    patterns: Args.string({
      description: "Limit checks to the tools required by these image inputs.",
      multiple: true,
      required: false,
    }),
  };

  static override description =
    "Diagnose optimizer tools for all or selected image formats.";

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
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(DependenciesDoctor);
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
    const inputs = await resolveInputs(options);
    const dependencies = collectRequiredDependencies(
      inputs,
      options,
      (args.patterns?.length ?? 0) === 0
    );
    const diagnostics = await diagnoseDependencies(dependencies);
    const ok = diagnostics.every(
      (diagnostic) => diagnostic.status === "healthy"
    );
    const data = {
      scope: (args.patterns?.length ?? 0) === 0 ? "full" : "selected-inputs",
      inputs: inputs.length,
      tools: diagnostics,
      ...(flags.verbose
        ? { diagnostics: [`Checked ${diagnostics.length} optimizer tool(s).`] }
        : {}),
    };

    process.exitCode = ok ? 0 : 1;
    if (this.jsonEnabled()) {
      return this.emitStatus("deps doctor", ok, data);
    }

    for (const tool of diagnostics) {
      const version = tool.rawVersion ? ` ${tool.rawVersion}` : "";
      this.log(
        `${symbolFor(tool.status)} ${tool.binary}${version} — ${tool.status}`
      );
      if (tool.status !== "healthy") {
        this.logToStderr(`  ${tool.remediation}`);
      }
    }
    if (flags.verbose) {
      this.logToStderr(`Checked ${diagnostics.length} optimizer tool(s).`);
    }
    return data;
  }
}

function symbolFor(
  status: "healthy" | "missing" | "outdated" | "unverifiable"
): string {
  return status === "healthy" ? "✔" : "✖";
}
