import { Flags } from "@oclif/core";

import { SqueezitCommand } from "../base-command";

export default class Commands extends SqueezitCommand {
  static override description = "List available Squeezit commands.";

  static override flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(Commands);
    const commands = this.config.commands
      .filter((command) => !command.hidden)
      .map((command) => displayCommandId(command.id))
      .sort();
    const data = {
      commands,
      ...(flags.verbose
        ? { diagnostics: [`Discovered ${commands.length} command(s).`] }
        : {}),
    };
    if (this.jsonEnabled()) return this.emit("commands", data);
    for (const command of commands) this.log(command);
    return data;
  }
}

function displayCommandId(id: string): string {
  return id.replaceAll(":", " ");
}
