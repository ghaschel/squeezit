import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { Command, Flags } from "@oclif/core";
import { CLIError } from "@oclif/core/errors";

import { CommandEventWriter, type CommandProgressReporter } from "./events";
import {
  type CommandEnvelope,
  type CommandMeta,
  createCommandEnvelope,
  createCommandErrorEnvelope,
  createCommandStatusEnvelope,
  SqueezitError,
} from "./output";

export abstract class SqueezitCommand extends Command {
  static override baseFlags = {
    events: Flags.option({
      description: "Stream structured command events as JSON Lines.",
      options: ["jsonl"] as const,
    })(),
  };

  static override enableJsonFlag = true;

  private eventWriter?: CommandEventWriter;

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

  protected machineOutputEnabled(): boolean {
    return this.outputMode() !== "human";
  }

  protected eventReporter(): CommandProgressReporter | undefined {
    return this.eventWriter;
  }

  protected phaseCompleted(
    phase: string,
    data?: Record<string, unknown>
  ): void {
    this.eventWriter?.phaseCompleted(phase, data);
  }

  protected phaseStarted(phase: string, data?: Record<string, unknown>): void {
    this.eventWriter?.phaseStarted(phase, data);
  }

  override jsonEnabled(): boolean {
    return this.machineOutputEnabled();
  }

  protected override async init(): Promise<void> {
    if (this.finalJsonEnabled() && this.eventsRequested()) {
      throw new SqueezitError({
        code: "VALIDATION_ERROR",
        message: "--json and --events jsonl cannot be used together.",
        remediation:
          "Use --json for one final result or --events jsonl for a live event stream.",
      });
    }

    if (this.eventsEnabled()) {
      this.eventWriter = new CommandEventWriter(this.commandName());
      this.eventWriter.started(this.commandMeta());
    }

    await super.init();
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
    if (this.machineOutputEnabled()) {
      const envelope = this.eventEnvelope(this.toErrorJson(error));
      if (this.eventsEnabled()) {
        this.eventWriter?.failed(envelope);
      } else {
        this.logJson(envelope);
      }
      process.exitCode = 1;
      return;
    }

    await super.catch(error as never);
  }

  protected commandMeta(): CommandMeta {
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

  protected inputCompleted(
    index: number,
    path: string,
    data?: Record<string, unknown>
  ): void {
    this.eventWriter?.inputCompleted(index, path, data);
  }

  protected inputStarted(index: number, path: string): void {
    this.eventWriter?.inputStarted(index, path);
  }

  protected override logJson(json: unknown): void {
    if (!this.eventsEnabled()) {
      super.logJson(json);
      return;
    }

    const envelope = this.eventEnvelope(json);
    this.eventWriter?.complete(envelope);
  }

  private eventEnvelope(json: unknown): CommandEnvelope<unknown> {
    if (!isCommandEnvelope(json)) {
      return createCommandEnvelope(
        this.commandName(),
        json,
        this.commandMeta()
      );
    }

    return {
      ...json,
      meta: this.commandMeta(),
    };
  }

  private eventsEnabled(): boolean {
    return this.outputMode() === "events";
  }

  private eventsRequested(): boolean {
    const passThroughIndex = this.argv.indexOf("--");
    const argumentsBeforePassThrough =
      passThroughIndex === -1
        ? this.argv
        : this.argv.slice(0, passThroughIndex);

    return argumentsBeforePassThrough.some(
      (argument, index) =>
        argument === "--events=jsonl" ||
        (argument === "--events" &&
          argumentsBeforePassThrough[index + 1] === "jsonl")
    );
  }

  private finalJsonEnabled(): boolean {
    return super.jsonEnabled();
  }

  private outputMode(): "events" | "human" | "json" {
    if (this.finalJsonEnabled()) return "json";
    return this.eventsRequested() ? "events" : "human";
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
