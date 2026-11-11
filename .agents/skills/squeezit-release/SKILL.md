---
name: squeezit-release
description: Use when preparing, creating, pushing, monitoring, recovering, or auditing a Squeezit version release, npm Trusted Publishing run, Oclif standalone archive, GitHub Release, or Homebrew tap update.
---

# Squeezit Release

## Overview

Bun remains the local development workflow. A pushed `v*` tag is the immutable
release input; GitHub Actions alone publishes npm, Oclif archives, the GitHub
Release, and Homebrew formula.

When asked to release, carry the authorized work through commit, initial push,
`bun release`, `bun push`, and the completed GitHub Actions run. Review each
result yourself and continue without asking for the same authorization again.
A request to create/edit this skill, prepare a plan, or audit a release does
not itself request publication.

## Release path

Run commands from the repository root, in this order; stop the sequence when a
command fails and inspect its result before continuing.

1. Read `AGENTS.md`, `docs/releasing.md`, `package.json`, `.versionrc.cjs`,
   `scripts/check-release-readiness.ts`, `scripts/split-changelog.mjs`,
   `scripts/custom-tag-message.mjs`, and `.github/workflows/release.yml`.
   Identify the last published release tag and inspect its diff through `HEAD`.
   Pass each changed path to `bun run agent:preflight --json` using repeated
   `--path` options, and read the recommended skills. Preflight includes dirty
   files automatically but otherwise misses already-committed release changes.
   Inspect the branch, upstream, working diff, staged diff, and untracked files.
   Verify GitHub CLI access with `gh auth status` and inspect
   `git remote get-url --push --all origin`; the push destination must be
   `ghaschel/squeezit`. Preserve unrelated work; if its scope
   prevents a clean release checkout, resolve that scope with the user.
2. Run the applicable non-slow commands from preflight before the initial
   commit/push, starting with `bun run verify:agent` and including
   `bun run test:integration` when recommended. Review generated changes, then
   commit the intended changes. Follow
   [the Commitlint skill](../../../.claude/skills/committing-with-commitlint/SKILL.md):
   read `bunx --no-install commitlint --print-config json`, validate the complete
   candidate message, stage explicit paths, and commit with hooks enabled.
   Inspect any hook changes. If the intended work is already committed, use
   that commit instead of creating an empty one.
3. On local `main`, run `git fetch origin main` and inspect ahead/behind state.
   Preview with `git push --dry-run origin main`, then `git push origin main`
   to publish only the implementation commits to the intended `main`. A clean
   checkout that is only behind can fast-forward with `git merge --ff-only
origin/main`; resolve divergence before proceeding, without force-pushing.
   If synchronization changes `HEAD`, refresh the changed-path hints and rerun
   the applicable checks before pushing the new tip.
   Confirm a clean worktree and `HEAD == origin/main`. These are enforced by
   the release readiness script. Do not switch branches over uncommitted work.
4. Run `bun release`. Let the configured Conventional Commits workflow choose
   the version unless the user specifies one. This procedure supports stable
   `X.Y.Z` releases only: the changelog splitter and publication workflow do not
   support prerelease/build-metadata versions or separate npm channels.
   The configured `scripts.postbump` in `.versionrc.cjs` invokes the package's
   `postbump` script; a package script alone does not register a release hook.
   The lifecycle rebuilds the
   manifest, splits the generated notes into `changelogs/<version>.md`, and
   creates the release commit and annotated tag. Review the generated changes:
   package and manifest versions must match, the changelog must describe the
   release, and `v<version>` must resolve to `HEAD`. Confirm the worktree is
   clean. If the command partially fails, inspect commits, version files, and
   tags before retrying; do not blindly bump again.
5. Run `bun run release:check`, preview `git push --dry-run --follow-tags`,
   then **`bun push`**. Require the preview to target `ghaschel/squeezit` and
   update only `main` and the reviewed release tag. `bun push` uses Git's
   default push configuration and can include other reachable annotated tags;
   resolve unexpected destinations or tags before continuing.
   The check installs locked
   dependencies and runs `verify:agent`; `bun push` runs
   `git push --follow-tags`. Together these retain the checks from
   `release:push` while using the requested command sequence. Inspect the
   worktree again after checks, before pushing; generated changes need review.
   Record the release version, tag, and full commit SHA for monitoring.
6. Wait for the exact tag's Release workflow as described below. Publishing
   the tag or seeing a queued run is not completion.

## Skip maximum-compression tests

The maintainer explicitly requested that this release skill skip the long
max-compression lane: do not run
`bun run test:slow`, `bun run test:all`, or directly execute
`tests/integration/api-max.test.ts`. Keep the non-slow checks, including fast
CLI tests that happen to mention max flags. If preflight recommends the slow
lane, record that it was skipped under this release preference and continue
with the non-slow commands. A later explicit request to run max tests overrides
this default. Never bypass Git hooks to skip tests.

## Wait for GitHub Actions

Set `release_tag` and `release_sha` from the reviewed local release. Find the
run by workflow, tag, event, and commit, rather than selecting the latest run:

```bash
gh run list --repo ghaschel/squeezit --workflow release.yml --event push \
  --branch "$release_tag" --commit "$release_sha" \
  --json databaseId,headBranch,headSha,status,conclusion,url
```

Allow up to five minutes for the matching run to appear, checking every
10–15 seconds. If none appears, inspect remote tag delivery and Actions access
and report the blocker; do not create another version or tag to trigger it.
Once identified, save its `databaseId` as `release_run_id` and wait:

```bash
gh run watch "$release_run_id" --repo ghaschel/squeezit --interval 15 --exit-status
gh run view "$release_run_id" --repo ghaschel/squeezit \
  --json status,conclusion,url,jobs
gh release view "$release_tag" --repo ghaschel/squeezit \
  --json tagName,isDraft,url,assets
```

Keep the watch process alive through asynchronous execution and give progress
updates at least once a minute. If watching is unavailable, poll `gh run view`
every 15–30 seconds until terminal status. Require `status: completed`,
`conclusion: success`, and a non-draft GitHub release with the expected assets.
The successful workflow must include npm publication, archive packaging,
Homebrew validation/tap update, and final GitHub release publication.

On failure or cancellation, inspect `gh run view "$release_run_id" --repo
ghaschel/squeezit --log-failed` and report the failing job and run URL. Resume
the same tag only after a concrete external cause is resolved, using
`gh run rerun "$release_run_id" --repo ghaschel/squeezit --failed` to retain
successful jobs. Watch the new attempt through completion. Allow one rerun
per repair, then report a repeated failure rather than looping. A source fix
needs a new release; do not move an already-pushed tag.

Finish with the version/tag, commit SHA, workflow URL and conclusion, published
release URL when available, verification results, and the skipped max tests.

## Non-negotiable boundaries

| Boundary    | Required behavior                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Lockfiles   | Commit only `bun.lock`; the Oclif staging tree owns its temporary `package-lock.json`                 |
| npm         | GitHub OIDC trusted publishing only; no local npm publish or npm token                                |
| Standalones | Embed Node for the approved targets; never claim native optimizers are embedded                       |
| Homebrew    | Formula downloads the immutable npm tarball and derives native dependencies from `DEPENDENCY_CATALOG` |
| Recovery    | Rerun the same tag only after resolving the external failure; published releases are not overwritten  |

## Verify and recover

- Before the tag push, run `bun run release:check`; when changing release code, also
  run `bun run test:unit`, `bun run typecheck`, `bun run test:cli`,
  `bun run check:exports`, and `npm pack --dry-run`.
- Confirm release assets are the three approved target archives, `SHA256SUMS`,
  and `release-metadata.json`. Homebrew uses the **npm tarball** SHA-256, not
  an Oclif archive checksum.
- If a workflow fails before publication, repair the actual cause and rerun the
  same tag: it safely resumes a matching npm version and existing draft assets.
  If the tap update fails, leave the release draft; correct external tap state,
  credentials, or runner configuration before rerunning. Changes to tagged
  formula-generation source require a new release.

## Common mistakes

- Do not run `npm publish`, `gh release create`, or tap updates locally.
- Do not push a tag before its version and `changelogs/<version>.md` agree.
- Do not commit `package-lock.json`, `npm-shrinkwrap.json`, or `yarn.lock`.
- Do not turn a global npm/Bun or standalone installation into Homebrew through
  `sqz update`; formula-managed installations are the only Homebrew updates.
