export interface CommandEnvelope<T> {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  data: T;
  error?: {
    message: string;
  };
}

export function createCommandEnvelope<T>(
  command: string,
  data: T
): CommandEnvelope<T> {
  return {
    schemaVersion: 1,
    command,
    ok: true,
    data,
  };
}

export function createCommandStatusEnvelope<T>(
  command: string,
  ok: boolean,
  data: T
): CommandEnvelope<T> {
  return {
    schemaVersion: 1,
    command,
    ok,
    data,
  };
}

export function createCommandErrorEnvelope(
  command: string,
  error: unknown
): CommandEnvelope<Record<string, never>> {
  return {
    schemaVersion: 1,
    command,
    ok: false,
    data: {},
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export function requiresExplicitConfirmation(options: {
  json: boolean;
  isTty: boolean;
}): boolean {
  return options.json || !options.isTty;
}
