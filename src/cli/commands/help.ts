import { Args, loadHelpClass } from "@oclif/core";

import { SqueezitCommand } from "../base-command";
import { SqueezitError } from "../output";

export default class Help extends SqueezitCommand {
  static override args = {
    command: Args.string({
      description: "Command to show help for.",
      multiple: true,
      required: false,
    }),
  };

  static override description = "Display help for Squeezit commands.";
  static override strict = false;

  async run(): Promise<unknown> {
    const { args } = await this.parse(Help);
    const command = (args.command ?? []).join(" ");
    const canonicalCommand = command.replaceAll(" ", ":");
    if (this.jsonEnabled()) {
      const commands = this.config.commands.filter(
        (candidate) => !candidate.hidden
      );
      const known = command
        ? commands.some(
            (candidate) =>
              candidate.id === canonicalCommand ||
              candidate.aliases.includes(canonicalCommand)
          )
        : true;
      process.exitCode = known ? 0 : 1;
      if (!known) {
        throw new SqueezitError({
          code: "UNKNOWN_COMMAND",
          details: { command },
          message: `Unknown command: ${command}`,
          remediation:
            "Run sqz commands or sqz help to discover available commands.",
        });
      }
      return this.emitStatus("help", known, {
        requestedCommand: command || null,
        commands: command
          ? [command]
          : commands
              .map((candidate) => candidate.id.replaceAll(":", " "))
              .sort(),
      });
    }

    const HelpClass = await loadHelpClass(this.config);
    const help = new HelpClass(this.config, {});
    await help.showHelp(command ? [canonicalCommand] : []);
    return { requestedCommand: command || null };
  }
}
