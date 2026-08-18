# Squeezit agent guide

## Project skills

Use the checked-in skill that matches the requested work before changing code:

- `.agents/skills/squeezit-add-command/SKILL.md` for CLI taxonomy, flags,
  command output, or JSON-contract work.
- `.agents/skills/squeezit-add-integration/SKILL.md` for bundler, framework,
  compiler, or package-subpath integrations.
- `.agents/skills/squeezit-add-image-format/SKILL.md` for image formats,
  optimizer binaries, metadata policy, and dependency catalog changes.
- `.agents/skills/squeezit-release/SKILL.md` for versioning, release tags,
  npm publishing, GitHub archives/releases, or Homebrew tap work.

## Test lanes

Start routine agent verification with `bun run verify:agent`. It runs
typechecking, fast unit tests, compiled CLI contract tests, export checks, and
package inspection without real image compression.

- `bun test` runs the non-slow default: fast, CLI, and integration lanes.
- `bun run test:slow` runs serial real `--profile max` compression checks.
- Run `test:slow` only when explicitly requested or when changing max-profile
  compression behavior. `bun run test:all` is the maintainer-only full suite.

## Commit convention

This repository enforces its commit convention with Commitlint and the rules
in `commitlint.config.cjs`. Treat the resolved configuration as the source of
truth; it adds a project-specific `type-enum` to the Conventional Commits
baseline.

- Before proposing a commit message, read the resolved rules:

  ```bash
  bunx --no-install commitlint --print-config json
  ```

- Validate the complete candidate message, including its body and footer when
  present:

  ```bash
  printf '%s' "<message>" | bunx --no-install commitlint
  ```

- If the `commit-msg` hook rejects a message, correct the rules reported in
  brackets, validate it again, and retry.
- Never bypass Git hooks for `git commit`, `git push`, `git merge`,
  `git cherry-pick`, `git rebase`, or `git am`. In particular, do not use
  `--no-verify`/`-n`, `git -c core.hooksPath=...`, or hook-disable environment
  variables such as `HUSKY=0` with those Git commands.

The checked-in Commitlint skill at
`.claude/skills/committing-with-commitlint/SKILL.md` provides the full commit
workflow. Use it whenever a task includes creating a commit.
