---
name: squeezit-release
description: Use when preparing, creating, pushing, monitoring, recovering, or auditing a Squeezit version release, npm Trusted Publishing run, Oclif standalone archive, GitHub Release, or Homebrew tap update.
---

# Squeezit Release

## Overview

Bun remains the local development workflow. A pushed `v*` tag is the immutable
release input; GitHub Actions alone publishes npm, Oclif archives, the GitHub
Release, and Homebrew formula.

## Release path

1. Read `docs/releasing.md`, `package.json`,
   `scripts/check-release-readiness.ts`, and `.github/workflows/release.yml`.
   Do not improvise a local publish or a package-lock commit.
2. Before `bun release`, confirm a clean worktree, local `main`, and
   `HEAD == origin/main`; the readiness script enforces all three. Prepare the
   changelog entry that will match the new version.
3. Run `bun release`, review the release commit/tag/changelog, then run
   `bun run release:push`. The latter runs the focused checks before pushing
   the tag. Do not run or require the known long max-profile compression suite
   as routine release validation.
4. Watch the tag workflow. It validates tag/version/changelog/main ancestry,
   publishes npm through OIDC provenance, packages Node-embedded archives,
   creates or resumes a draft GitHub Release, smoke-tests the Homebrew formula
   on macOS, updates the tap, and only then publishes the release.

## Non-negotiable boundaries

| Boundary    | Required behavior                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Lockfiles   | Commit only `bun.lock`; the Oclif staging tree owns its temporary `package-lock.json`                 |
| npm         | GitHub OIDC trusted publishing only; no local npm publish or npm token                                |
| Standalones | Embed Node for the approved targets; never claim native optimizers are embedded                       |
| Homebrew    | Formula downloads the immutable npm tarball and derives native dependencies from `DEPENDENCY_CATALOG` |
| Recovery    | Rerun the same tag only after resolving the external failure; published releases are not overwritten  |

## Verify and recover

- Before pushing, run `bun run release:check`; when changing release code, also
  run `bun run test:unit`, `bun run typecheck`, `bun run test:cli`,
  `bun run check:exports`, and `npm pack --dry-run`.
- Confirm release assets are the three approved target archives, `SHA256SUMS`,
  and `release-metadata.json`. Homebrew uses the **npm tarball** SHA-256, not
  an Oclif archive checksum.
- If a workflow fails before publication, repair the actual cause and rerun the
  same tag: it safely resumes a matching npm version and existing draft assets.
  If the tap update fails, leave the release draft; correct the tap token,
  formula, or runner issue and rerun.

## Common mistakes

- Do not run `npm publish`, `gh release create`, or tap updates locally.
- Do not push a tag before its version and `changelogs/<version>.md` agree.
- Do not commit `package-lock.json`, `npm-shrinkwrap.json`, or `yarn.lock`.
- Do not turn a global npm/Bun or standalone installation into Homebrew through
  `sqz update`; formula-managed installations are the only Homebrew updates.
