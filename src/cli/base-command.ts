import { Command } from "@oclif/core";

import {
  type CommandEnvelope,
  createCommandEnvelope,
  createCommandErrorEnvelope,
  createCommandStatusEnvelope,
} from "./output";

export abstract class SqueezitCommand extends Command {
  static override enableJsonFlag = true;

  protected emit<T>(command: string, data: T): CommandEnvelope<T> {
    return createCommandEnvelope(command, data);
  }

  protected emitStatus<T>(
    command: string,
    ok: boolean,
    data: T
  ): CommandEnvelope<T> {
    return createCommandStatusEnvelope(command, ok, data);
  }

  protected printJson<T>(command: string, data: T): void {
    process.stdout.write(
      `${JSON.stringify(createCommandEnvelope(command, data))}\n`
    );
  }

  override async catch(error: unknown): Promise<void> {
    // Oclif marks parsing as complete only after a successful parse. Mark it
    // here as well so a JSON validation error remains a single clean document
    // instead of also triggering Oclif's development warning on stderr.
    this.parsed = true;
    const command = (this.id ?? "sqz").replaceAll(":", " ");

    if (this.jsonEnabled()) {
      process.stdout.write(
        `${JSON.stringify(createCommandErrorEnvelope(command, error))}\n`
      );
      process.exitCode = 1;
      return;
    }

    await super.catch(error as never);
  }
}
