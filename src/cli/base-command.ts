import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { Command } from "@oclif/core";
import { CLIError } from "@oclif/core/errors";

import {
  type CommandEnvelope,
  type CommandMeta,
  createCommandEnvelope,
  createCommandErrorEnvelope,
  createCommandStatusEnvelope,
  SqueezitError,
} from "./output";

export abstract class SqueezitCommand extends Command {
  static override enableJsonFlag = true;

  protected emit<T>(command: string, data: T): CommandEnvelope<T> {
    return createCommandEnvelope(command, data, this.commandMeta());
  }

  protected emitStatus<T>(
    command: string,
    ok: boolean,
    data: T,
    error?: Parameters<typeof createCommandStatusEnvelope>[4]
  ): CommandEnvelope<T> {
    return createCommandStatusEnvelope(
      command,
      ok,
      data,
      this.commandMeta(),
      error
    );
  }

  protected override toSuccessJson(result: unknown): unknown {
    if (!isCommandEnvelope(result)) {
      return createCommandEnvelope(
        this.commandName(),
        result,
        this.commandMeta()
      );
    }

    return {
      schemaVersion: 2,
      command: result.command,
      ok: result.ok,
      data: result.data,
      ...(result.error ? { error: result.error } : {}),
      meta: this.commandMeta(),
    } satisfies CommandEnvelope<unknown>;
  }

  protected override toErrorJson(error: unknown): unknown {
    return createCommandErrorEnvelope(
      this.commandName(),
      error instanceof CLIError
        ? new SqueezitError({
            code: "VALIDATION_ERROR",
            message: error.message,
            remediation: "Review the command syntax with --help and try again.",
          })
        : error,
      this.commandMeta()
    );
  }

  override async catch(error: unknown): Promise<void> {
    // Oclif marks parsing as complete only after a successful parse. Mark it
    // here as well so a JSON validation error remains a single clean document
    // instead of also triggering Oclif's development warning on stderr.
    this.parsed = true;
    if (this.jsonEnabled()) {
      this.logJson(this.toErrorJson(error));
      process.exitCode = 1;
      return;
    }

    await super.catch(error as never);
  }

  private commandMeta(): CommandMeta {
    const invocationPath = resolve(process.argv[1] ?? process.execPath);

    return {
      cwd: process.cwd(),
      executablePath: resolveRealPath(invocationPath),
      invocationPath,
      nodeVersion: process.versions.node,
      packageRoot: resolveRealPath(this.config.root),
      platform: `${process.platform}-${process.arch}`,
      squeezitVersion: this.config.version,
    };
  }

  private commandName(): string {
    return (this.id ?? "sqz").replaceAll(":", " ");
  }
}

function isCommandEnvelope(
  value: unknown
): value is Omit<CommandEnvelope<unknown>, "meta"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.command === "string" &&
    typeof candidate.ok === "boolean" &&
    "data" in candidate
  );
}

function resolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
