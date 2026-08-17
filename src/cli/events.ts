import { randomUUID } from "node:crypto";

import type { CommandEnvelope, CommandMeta } from "./output";

export type CommandEventName =
  | "command.completed"
  | "command.failed"
  | "command.started"
  | "input.completed"
  | "input.started"
  | "phase.completed"
  | "phase.started";

interface EventBase {
  command: string;
  event: CommandEventName;
  runId: string;
  schemaVersion: 1;
  sequence: number;
  timestamp: string;
}

export interface CommandStartedEvent extends EventBase {
  event: "command.started";
  meta: CommandMeta;
}

export interface CommandPhaseEvent extends EventBase {
  data?: Record<string, unknown>;
  event: "phase.completed" | "phase.started";
  phase: string;
}

export interface CommandInputEvent extends EventBase {
  data?: Record<string, unknown>;
  event: "input.completed" | "input.started";
  input: { index: number; path: string };
}

export interface CommandTerminalEvent extends EventBase {
  data: unknown;
  error?: CommandEnvelope<unknown>["error"];
  event: "command.completed" | "command.failed";
  ok: boolean;
}

export type CommandEvent =
  | CommandInputEvent
  | CommandPhaseEvent
  | CommandStartedEvent
  | CommandTerminalEvent;

type CommandEventPayload =
  | Omit<
      CommandInputEvent,
      "command" | "runId" | "schemaVersion" | "sequence" | "timestamp"
    >
  | Omit<
      CommandPhaseEvent,
      "command" | "runId" | "schemaVersion" | "sequence" | "timestamp"
    >
  | Omit<
      CommandStartedEvent,
      "command" | "runId" | "schemaVersion" | "sequence" | "timestamp"
    >
  | Omit<
      CommandTerminalEvent,
      "command" | "runId" | "schemaVersion" | "sequence" | "timestamp"
    >;

export interface CommandProgressReporter {
  inputCompleted(
    index: number,
    path: string,
    data?: Record<string, unknown>
  ): void;
  inputStarted(index: number, path: string): void;
  phaseCompleted(phase: string, data?: Record<string, unknown>): void;
  phaseStarted(phase: string, data?: Record<string, unknown>): void;
}

export class CommandEventWriter implements CommandProgressReporter {
  readonly runId = randomUUID();

  private sequence = 0;

  constructor(private readonly command: string) {}

  complete(envelope: CommandEnvelope<unknown>): void {
    this.write({
      data: envelope.data,
      ...(envelope.error ? { error: envelope.error } : {}),
      event: "command.completed",
      ok: envelope.ok,
    });
  }

  failed(envelope: CommandEnvelope<unknown>): void {
    this.write({
      data: envelope.data,
      ...(envelope.error ? { error: envelope.error } : {}),
      event: "command.failed",
      ok: false,
    });
  }

  inputCompleted(
    index: number,
    path: string,
    data?: Record<string, unknown>
  ): void {
    this.write({
      ...(data ? { data } : {}),
      event: "input.completed",
      input: { index, path },
    });
  }

  inputStarted(index: number, path: string): void {
    this.write({ event: "input.started", input: { index, path } });
  }

  phaseCompleted(phase: string, data?: Record<string, unknown>): void {
    this.write({ ...(data ? { data } : {}), event: "phase.completed", phase });
  }

  phaseStarted(phase: string, data?: Record<string, unknown>): void {
    this.write({ ...(data ? { data } : {}), event: "phase.started", phase });
  }

  started(meta: CommandMeta): void {
    this.write({ event: "command.started", meta });
  }

  private write(event: CommandEventPayload): void {
    const record = {
      command: this.command,
      ...event,
      runId: this.runId,
      schemaVersion: 1,
      sequence: (this.sequence += 1),
      timestamp: new Date().toISOString(),
    } as CommandEvent;

    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
}
