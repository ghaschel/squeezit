# Agent development harness

The repository includes a read-only Bun harness for coding agents. It reports
the local development state before an agent edits code; it is not a public
Squeezit CLI command or npm API.

## Start here

```bash
bun run agent:preflight --json
```

`agent:preflight` returns one JSON document on stdout and never installs
packages, fetches Git, builds artifacts, changes images, or invokes a
state-changing Squeezit command. It accepts optional repository-relative path
hints when an agent knows likely targets before the first edit:

```bash
bun run agent:preflight --json \
  --path src/cli/commands/compress.ts \
  --path tests/integration/cli-json.test.ts
```

Use `bun run agent:status --json` when only the report is needed. Both commands
require `--json` in v1 and reject unknown options or paths outside the
repository with one structured error document and exit code 1.

Parse stdout only. Bun may print its local script invocation or non-zero-script
notice on stderr when these commands are launched through `bun run`.

## JSON contract

Every response has this shape:

```json
{
  "schemaVersion": 1,
  "command": "agent:preflight",
  "ok": true,
  "data": {},
  "issues": []
}
```

Status data includes Git branch/HEAD/upstream and parsed worktree entries,
Bun/Node/package versions, `bun.lock` and `node_modules` availability, native
optimizer diagnostics, discovered Squeezit installations, checked-in skills,
and the current verification recommendation.

`agent:preflight` wraps that report with `blockers`, `warnings`, and ordered
`nextActions`. It blocks only when Git/project inspection cannot run, Bun is
not the required `1.3.5`, Node is below `22.13.0`, `bun.lock` is absent, or
project dependencies are unavailable. A dirty worktree, missing upstream,
stale/shadowed installation, unsupported native-tool platform, or unhealthy
optimizer is a warning. Preserve existing dirty changes; they are never
permission to discard or overwrite files.

## Agent workflow

1. Run `bun run agent:preflight --json` before changing code.
2. Read `AGENTS.md` and every skill in `data.status.skills.recommended`.
3. For image work, discover `sqz capabilities --json` and check `sqz doctor --json`.
4. Use `--dry-run` or create and review a `sqz plan` artifact before any apply.
5. Add `--yes` only after explicit approval, then run every command in `verification.commands`.

The verification recommendation always starts with `bun run verify:agent`. It
adds focused integration tests for changed adapters, `test:integration` for
core/image changes, `test:agent` for harness changes, and the serial
`test:slow` lane only when the diff explicitly changes max-profile behavior.

## Deterministic evaluation

Run the harness evaluation suite with:

```bash
bun run test:agent
```

The suite consumes recorded command traces and capability metadata. It verifies
that an agent discovers capabilities, runs doctor before image work, preserves
sources during dry runs, creates a plan before applying it, respects `--yes`,
and stops unsafe follow-up after typed failures. It is deterministic: it does
not call an LLM, access the network, or execute real optimizer compression.

It validates observable workflow behavior, not an LLM's hidden reasoning. A
model-in-the-loop evaluator can later feed its command trace into the same
rules without changing this development contract.
