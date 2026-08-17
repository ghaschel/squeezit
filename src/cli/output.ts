export type SqueezitIssueCode =
  | "CONFIRMATION_REQUIRED"
  | "DEPENDENCY_MISSING"
  | "INTERNAL_ERROR"
  | "OPERATION_CANCELLED"
  | "PLAN_INPUT_CHANGED"
  | "PLAN_INVALID"
  | "PLAN_OUTPUT_EXISTS"
  | "PLAN_RUNTIME_CHANGED"
  | "PLAN_TOOL_CHANGED"
  | "SHADOWED_INSTALLATION"
  | "STALE_INSTALLATION"
  | "UNKNOWN_COMMAND"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_PLATFORM"
  | "UPDATE_UNAVAILABLE"
  | "VALIDATION_ERROR";

export interface SqueezitIssue {
  code: SqueezitIssueCode;
  message: string;
  remediation: string;
  details?: Record<string, unknown>;
}

export interface CommandMeta {
  cwd: string;
  executablePath: string;
  invocationPath: string;
  nodeVersion: string;
  packageRoot: string;
  platform: string;
  squeezitVersion: string;
}

export interface CommandEnvelope<T> {
  schemaVersion: 2;
  command: string;
  ok: boolean;
  data: T;
  meta: CommandMeta;
  error?: SqueezitIssue;
}

export class SqueezitError extends Error {
  readonly code: SqueezitIssueCode;
  readonly details?: Record<string, unknown>;
  readonly remediation: string;

  constructor(issue: SqueezitIssue) {
    super(issue.message);
    this.name = "SqueezitError";
    this.code = issue.code;
    this.details = issue.details;
    this.remediation = issue.remediation;
  }

  toIssue(): SqueezitIssue {
    return {
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function createCommandEnvelope<T>(
  command: string,
  data: T,
  meta: CommandMeta
): CommandEnvelope<T> {
  return {
    schemaVersion: 2,
    command,
    ok: true,
    data,
    meta,
  };
}

export function createCommandStatusEnvelope<T>(
  command: string,
  ok: boolean,
  data: T,
  meta: CommandMeta,
  error?: SqueezitIssue
): CommandEnvelope<T> {
  return {
    schemaVersion: 2,
    command,
    ok,
    data,
    meta,
    ...(error ? { error } : {}),
  };
}

export function createCommandErrorEnvelope(
  command: string,
  error: unknown,
  meta: CommandMeta
): CommandEnvelope<Record<string, never>> {
  return {
    schemaVersion: 2,
    command,
    ok: false,
    data: {},
    error: toSqueezitIssue(error),
    meta,
  };
}

export function toSqueezitIssue(error: unknown): SqueezitIssue {
  if (error instanceof SqueezitError) return error.toIssue();

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    remediation:
      "Re-run the command. If the problem persists, report it with the command output.",
  };
}

export function requiresExplicitConfirmation(options: {
  machineOutput: boolean;
  isTty: boolean;
}): boolean {
  return options.machineOutput || !options.isTty;
}
