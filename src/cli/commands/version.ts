import { Flags } from "@oclif/core";

import { SqueezitCommand } from "../base-command";

export default class Version extends SqueezitCommand {
  static override description = "Display the installed Squeezit version.";

  static override flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Print version diagnostics to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(Version);
    const data = {
      version: this.config.version,
      bin: this.config.bin,
      ...(flags.verbose ? { diagnostics: [`Root: ${this.config.root}`] } : {}),
    };
    if (this.jsonEnabled()) return this.emit("version", data);
    this.log(this.config.version);
    if (flags.verbose) this.logToStderr(`Root: ${this.config.root}`);
    return data;
  }
}
