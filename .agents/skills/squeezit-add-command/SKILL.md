---
name: squeezit-add-command
description: Use when adding, renaming, splitting, aliasing, or substantially changing a Squeezit Oclif command, command flag, positional argument, human CLI output, or JSON command contract.
---

# Squeezit Add Command

## Overview

Treat the CLI as both a human interface and an automation API. Preserve its
taxonomy, one-document JSON output, non-interactive safety, and completion
metadata together.

## Decide the surface first

| Need                                    | Prefer                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| A new operation with distinct ownership | A new space-separated Oclif command path                                |
| A variation of an existing operation    | An existing command flag or argument                                    |
| A short, established alternate name     | An Oclif alias                                                          |
| A health/readiness view                 | Extend or reuse `doctor`/`deps doctor` data before creating a duplicate |

Do not make the bare `sqz` command operational. Keep topic paths strict and
space-separated. Prefer a first-class command over an alias when automation
needs a distinct `command` field in JSON.

## Implement

1. Read `src/cli/base-command.ts`, `src/cli/output.ts`, and the closest
   command in `src/cli/commands/`. Reuse its data collector; extract a shared
   helper before duplicating command logic.
2. Add the command under `src/cli/commands/` using `SqueezitCommand`. Define
   typed Oclif arguments and flags; enumerate finite values with
   `Flags.option` so help and completion can discover them.
3. Every Squeezit-owned command must support `--json`. Emit the established
   envelope exactly once on stdout: `{schemaVersion: 1, command, ok, data}`.
   Put human diagnostics on stderr; in JSON mode put requested verbose
   diagnostics in `data.diagnostics`.
4. If the command changes files, installs tools, or updates software, require
   `--yes` in JSON or non-TTY mode. Do not accept piped confirmation.
5. Preserve the output rules: JSON never creates spinners or durable prose;
   human interactive work may use transient TTY progress, and non-TTY human
   mode streams durable results.
6. Update command discovery/help documentation and regenerate the Oclif
   manifest with the normal build command. Do not hand-edit generated output.

## Verify

- Add taxonomy coverage in `tests/unit/cli-taxonomy.test.ts` when the command
  changes the public surface.
- Exercise the compiled CLI in `tests/integration/cli-json.test.ts`: success,
  expected unhealthy state, validation failure, `--verbose`, stdout purity,
  and exit-code/`ok` alignment.
- Test human output separately when it has meaningful branching, including
  TTY/non-TTY behavior for commands that process files.
- Run `bun run test:cli`, `bun run typecheck`, and `bun run build`. Do not run
  the long max-profile compression test merely to add a command.

## Common mistakes

- Do not bypass `SqueezitCommand`; it owns JSON errors as well as successes.
- Do not emit progress, logs, or multiple JSON documents to stdout in JSON mode.
- Do not make an alias when callers must distinguish the command identity.
- Do not forget README/API command references, `oclif.manifest.json`, and
  autocomplete-relevant option enumerations.
