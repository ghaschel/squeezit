# Task 3 Report: GitHub tag-release workflow

## Status

Implemented the `v*` tag release workflow in `.github/workflows/release.yml` with static/semantic contract coverage in `tests/unit/release-workflow.test.ts` and an independently specified archive fixture in `tests/fixtures/release/expected-archives.json`.

The workflow has six serialized jobs:

1. `validate` verifies the tag/package version match, changelog presence, tag-commit reachability from `origin/main`, and the absence of an already-published GitHub release before running the focused project checks.
2. `publish_npm` uses npm Trusted Publishing through GitHub OIDC only. It skips an exact existing npm version, distinguishes an npm 404 from ambiguous registry failures, and publishes without a token or `registry-url` setup.
3. `package_archives` creates a git-archive staging tree under `$RUNNER_TEMP`, creates `package-lock.json` only there, invokes Oclif with the package-config target list and `--no-xz`, normalizes three archive names, polls npm for its tarball, and emits/verifies `SHA256SUMS` plus `release-metadata.json`.
4. `draft_release` creates or resumes only a draft release, refreshes changelog notes, and uploads all verified artifacts with `--clobber`.
5. `update_tap` renders the formula with the npm tarball SHA-256, prepares a local-only tap commit, registers the checkout as `ghaschel/tap`, installs/smokes the formula on `macos-latest`, and pushes the tap default branch only after smoke success and only when changed.
6. `publish_release` publishes the draft only after the tap job succeeds.

All jobs declare explicit least-privilege permissions. The workflow is serialized per tag with `cancel-in-progress: false`, uses Ubuntu for validation/npm/Oclif work, pins Node `24.16.0` and Bun `1.3.5`, and never runs full/max compression.

## TDD evidence

### Initial RED

Command:

```text
bunx vitest run tests/unit/release-workflow.test.ts
```

Observed: `6 failed (6)` because `.github/workflows/release.yml` did not exist. Every failure was `ENOENT` for the missing workflow, confirming the new contract was exercised before implementation.

### GREEN

After implementing the workflow, the focused suite reached `6 passed (6)`. A seventh test was then added to parse every embedded run block with `bash -n`.

Additional red/green regression cycles caught and fixed:

- Missing `GH_REPO` in the no-checkout final publish job: assertion received `undefined`, then passed after adding `${{ github.repository }}`.
- Unsupported recent-Homebrew local-formula installation: named-tap assertion failed, then passed after registering the checked-out tap and installing `ghaschel/tap/squeezit`.
- Ambiguous GitHub release lookup failures: preflight assertion failed, then passed after only treating explicit HTTP 404 as release absence.
- Draft-resume changelog notes: resume assertion failed, then passed after refreshing notes with `gh release edit --notes-file`.
- Husky lifecycle isolation: three assertions failed, then passed after setting `HUSKY=0` on npm pack/publish and Oclif packaging lifecycle commands.

Final focused result:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

## Verification evidence

- `bun run typecheck`: passed (`tsc --noEmit`, exit 0).
- `bun run test:cli`: passed, 4 files and 30 tests.
- `bun run check:exports`: passed; publint emitted only its existing repository URL suggestion.
- `HUSKY=0 npm_config_cache=/private/tmp/squeezit-npm-cache npm pack --dry-run`: passed; npm reported 102 files in `squeezit-1.17.1.tgz`.
- `bunx eslint tests/unit/release-workflow.test.ts`: passed.
- Prettier check for the workflow, test, and fixture: passed.
- `git diff --check`: passed.
- Contract test parses the workflow as YAML and runs `bash -n` against every embedded shell block.

The first local npm dry-run attempt built successfully but failed when the existing Husky prepare script tried to write sandbox-protected `.git/config`, and npm could not write its home-directory log. That directly produced the `HUSKY=0` regression contract. Re-running with Husky disabled and a writable temporary npm cache passed.

## Requirement audit

- Trigger/concurrency: `push.tags: [v*]`; per-ref concurrency; reruns are not canceled.
- Immutable inputs: version equality, changelog, `origin/main` ancestry, published-release fail-safe.
- Focused validation: `bun ci`, typecheck, `test:cli`, `check:exports`, `npm pack --dry-run`; no full/max command.
- npm: OIDC `id-token: write` only in publish job; no npm secret/token; no setup-node registry URL; exact-version skip; non-404 failures abort.
- Oclif: staging and lock under `$RUNNER_TEMP`; targets read from package config; exact three normalized `.tar.gz` outputs; no xz.
- Verification: archive checksum verification, macOS tar-content checks on Linux, Linux CLI smoke commands, npm polling and tarball checksum.
- Release: draft create/resume through `gh`, changelog notes, clobbered artifact upload, published only after tap success.
- Tap: token checkout of `ghaschel/homebrew-tap`, npm tarball checksum supplied to renderer, named-tap install on standard macOS, `version`/`doctor` JSON smoke, direct default-branch push only for a tested non-empty change.

## Remaining operational concerns

- External publication, Oclif Node downloads, GitHub release mutation, and the macOS Homebrew install were intentionally not executed locally. The workflow is covered by static semantic checks and shell parsing, but its first tag run remains the integration test.
- npm must have a Trusted Publisher entry whose workflow filename is exactly `release.yml`; otherwise OIDC publication will fail closed.
- `HOMEBREW_TAP_TOKEN` must be configured with push access to `ghaschel/homebrew-tap` and that repository must permit the requested direct default-branch push.
- The formula installs a broad native dependency catalog, so the macOS smoke job may be comparatively slow.
