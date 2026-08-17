# Agent-ready CLI contract

Squeezit is designed to be safely discoverable and controllable by people,
scripts, and AI agents. Every first-party command supports `--json` and emits
one JSON document on stdout. Human-oriented diagnostics remain on stderr.

`sqz autocomplete` is provided by Oclif and is the deliberate exception: use
it only for shell completion, not as an automation response.

## Discover before acting

Ask the installed binary for its contract before choosing a command:

```bash
sqz capabilities --json
```

The response lists all first-party command paths, aliases, positional
arguments, flags, defaults, finite option values, descriptions, JSON support,
side effects, confirmation rules, and output-schema references. It also lists
external commands such as `autocomplete`, marked as outside the JSON contract.

Use the reported capability data rather than hard-coding a command taxonomy.
In particular, inspect `effects` and `confirmation.requiredWhen` before an
operation that may write files, install system tools, or update Squeezit.

## Command envelope v2

Every `--json` response from a Squeezit-owned command has this top-level
shape:

```json
{
  "schemaVersion": 2,
  "command": "compress",
  "ok": true,
  "data": {},
  "meta": {
    "squeezitVersion": "2.0.7",
    "invocationPath": "/path/to/bin/sqz",
    "executablePath": "/path/to/squeezit/bin/run.js",
    "packageRoot": "/path/to/squeezit",
    "nodeVersion": "24.16.0",
    "cwd": "/path/to/project",
    "platform": "darwin-arm64"
  }
}
```

`meta` describes the binary that actually ran. All paths are intentionally
absolute: an agent can use them to recognize a stale, shadowed, or unexpected
installation without guessing from its environment.

`ok: false` always corresponds to exit code `1`. Some commands can report an
expected unhealthy state with `ok: false` and useful data, rather than throwing
an opaque failure. A successful process exit is not a substitute for checking
`ok`.

## Errors and remediation

Command failures retain the same envelope and add an `error` object:

```json
{
  "schemaVersion": 2,
  "command": "compress",
  "ok": false,
  "data": {},
  "error": {
    "code": "UNSUPPORTED_FORMAT",
    "message": "Unsupported image format: /work/document.txt",
    "remediation": "Use a supported image format or remove this input.",
    "details": { "paths": ["/work/document.txt"] }
  },
  "meta": {
    "squeezitVersion": "2.0.7",
    "invocationPath": "/path/to/bin/sqz",
    "executablePath": "/path/to/squeezit/bin/run.js",
    "packageRoot": "/path/to/squeezit",
    "nodeVersion": "24.16.0",
    "cwd": "/work",
    "platform": "darwin-arm64"
  }
}
```

Branch on `error.code`, then display or follow `remediation`. Do not parse the
human-readable `message`.

| Code                    | Meaning                                                                                | Typical next action                                                         |
| ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `VALIDATION_ERROR`      | CLI syntax or incompatible flags are invalid.                                          | Inspect `sqz capabilities --json` or `--help`, then correct the invocation. |
| `UNKNOWN_COMMAND`       | A requested command does not exist.                                                    | Discover commands with `sqz capabilities --json`.                           |
| `UNSUPPORTED_FORMAT`    | An explicit existing input is not an image Squeezit supports.                          | Remove it or provide a supported image file.                                |
| `UNSUPPORTED_PLATFORM`  | The host OS cannot use the native toolchain.                                           | Use macOS or Debian/Ubuntu Linux.                                           |
| `DEPENDENCY_MISSING`    | Required optimizer binaries are unavailable or unhealthy.                              | Run `sqz deps install` or follow the remediation.                           |
| `CONFIRMATION_REQUIRED` | A state-changing action was requested in JSON or non-interactive mode without `--yes`. | Review the operation and re-run with `--yes`.                               |
| `OPERATION_CANCELLED`   | An interactive confirmation was declined.                                              | Stop, or re-run and approve intentionally.                                  |
| `UPDATE_UNAVAILABLE`    | The requested update source or release cannot be applied.                              | Use the reported details/remediation or choose an explicit package manager. |
| `PLAN_INVALID`          | A plan is malformed, unsupported, or its deterministic digest does not match.          | Create and review a new plan with the current CLI.                          |
| `PLAN_OUTPUT_EXISTS`    | A requested plan artifact path already exists.                                         | Choose a new `--output` path or remove the reviewed artifact intentionally. |
| `PLAN_INPUT_CHANGED`    | A planned source changed, disappeared, or was replaced after planning began.           | Create and review a new plan before writing images.                         |
| `PLAN_TOOL_CHANGED`     | A required native optimizer's provider or normalized version changed.                  | Restore the expected toolchain or create a new plan.                        |
| `PLAN_RUNTIME_CHANGED`  | The Squeezit version or platform differs from the reviewed plan.                       | Create a new plan in the current environment.                               |
| `INTERNAL_ERROR`        | An unexpected error reached the command boundary.                                      | Re-run; report the complete envelope if it persists.                        |

`STALE_INSTALLATION` and `SHADOWED_INSTALLATION` are normally doctor warnings,
not command failures. They identify another discovered binary that is newer
than, or appears earlier on `PATH` than, the active Squeezit installation.

Explicit existing unsupported files fail early—before confirmations,
dependency checks, or writes. Directory scans and glob patterns still ignore
non-image files so mixed asset directories remain convenient.

## Reviewable plan and apply workflow

Use plans when an agent must separate analysis from file writes:

```bash
sqz capabilities --json
sqz plan compress "assets/**/*.{png,jpg}" --output .squeezit/plans/assets.json --json
sqz plan apply .squeezit/plans/assets.json --yes --json
```

`plan compress` and `plan metadata strip` are lightweight: they resolve inputs,
take streaming SHA-256 and byte-size fingerprints, record only semantic
optimization settings, and require every needed optimizer to be healthy. They
do not optimize an image or predict savings. `plan exif` is the alias for
`plan metadata strip`.

Review the raw artifact's `planDigest`, absolute `inputs`, `options`, and
`tools` before approving an apply. The artifact also retains the Squeezit
version, platform, Node version, and original working directory for audit.
Node is informational; Squeezit version and platform are strict apply gates.

`plan apply` accepts no optimizer overrides and always requires `--yes`, even
in a human TTY. Before any optimizer starts it validates the artifact version
and digest, every planned source fingerprint, the Squeezit version/platform,
and each required tool's provider plus normalized version. It checks each
source again immediately before working-copy creation and before replacement.
The preflight prevents writes when any file changed before apply; files changed
after another optimization started are reported individually and are not
overwritten. This is deliberately not a filesystem-wide transaction.

## Installation health

Run:

```bash
sqz doctor --json
```

`data.installation` contains every `sqz` and `squeezit` file found in `PATH`,
their resolved targets, package roots and versions when identifiable, duplicate
paths, and any stale/shadowed warnings. The scanner does not execute the
candidate binaries and does not inspect shell aliases.

Installation ambiguity sets `data.installation.status` to `"warning"`; it does
not change the readiness result or force a nonzero exit code. Runtime,
platform, and native-tool health continue to determine `ok` for `doctor`.

## Schemas

The package publishes JSON Schema draft 2020-12 documents:

- Local: `squeezit/schemas/command-envelope-v2.schema.json`
- Local: `squeezit/schemas/capabilities-v1.schema.json`
- Local: `squeezit/schemas/optimization-plan-v1.schema.json`

`sqz capabilities --json` supplies the exact version-pinned unpkg URLs for
all three files in `data.schemas`. Validate the outer response against the envelope
schema. For `capabilities`, validate `data` against the capabilities schema as
well; the envelope schema references it for the successful `capabilities`
response. Validate the raw plan artifact against the optimization-plan schema;
the envelope schema references it for successful plan creation and apply data.

Schema v2 supersedes the JSON envelope used by older Squeezit releases. Agents
should require `schemaVersion: 2` before relying on this contract.
