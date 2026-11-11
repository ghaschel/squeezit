# Releasing Squeezit

This guide is for maintainers of `ghaschel/squeezit`. Releases are published by
the GitHub Actions workflow at [`.github/workflows/release.yml`](https://github.com/ghaschel/squeezit/blob/main/.github/workflows/release.yml),
which runs when a `v*` tag is pushed. Do not publish a release locally.

## Prerequisites

- This workflow assumes `ghaschel/squeezit` and `ghaschel/homebrew-tap` are
  public repositories eligible for GitHub's free standard GitHub-hosted runner
  model, including the `macos-latest` runner used for formula smoke tests.
- Configure npm Trusted Publishing for the `squeezit` package with GitHub as the
  provider, repository `ghaschel/squeezit`, and workflow filename exactly
  `release.yml`. Publishing uses GitHub OIDC and provenance, so do not create
  or store an npm access token for this workflow.
- Add `HOMEBREW_TAP_TOKEN` as a repository secret in `ghaschel/squeezit`. It
  must be a fine-grained personal access token scoped only to
  `ghaschel/homebrew-tap`, with repository **Contents: read and write**
  permission. No broader repository access is needed.

## Create and push a release

Start from a clean, up-to-date `main` checkout with the release notes prepared.
Commit the intended changes and push those commits to `origin/main` first.
The readiness script verifies a clean worktree, local `main`, and
`HEAD == origin/main`; inspect the push destination and version/tag availability
separately. This procedure supports stable `X.Y.Z` versions. Prerelease and
build-metadata versions need changes to changelog splitting and npm channel
handling before they can use this workflow.

For agents, the repository-only
[`squeezit-release` skill](https://github.com/ghaschel/squeezit/blob/main/.agents/skills/squeezit-release/SKILL.md)
carries out the commit, push, release, and monitoring sequence. Include paths
from the previous published tag through `HEAD` as repeated `--path` arguments
to `bun run agent:preflight --json`, so already-committed changes receive their
required checks. Run the recommended non-slow checks; the skill explicitly
skips the long max-compression lane.

Create the local release commit and tag:

```bash
bun release
```

Review the generated commit, changelog, and tag. Run the focused release checks,
preview the push destination and outgoing refs, then push:

```bash
bun run release:check
git push --dry-run --follow-tags
bun push
```

The preview must update only the intended `main` and release tag on
`ghaschel/squeezit`. `bun push` uses Git's default push destination and
`--follow-tags` can include other reachable annotated tags. The existing
`bun run release:push` convenience command combines the checks and push.

The `postbump` lifecycle hook registered in `.versionrc.cjs` invokes
`bun run postbump`, which rebuilds the Oclif CLI and regenerates
`oclif.manifest.json` after the version bump, before the version commit and tag
are created. The committed manifest therefore always carries the same version
as `package.json`.

`release:push` runs locked dependency installation followed by
`bun run verify:agent`: typechecking, the fast lane, compiled CLI contracts,
package-export checks, and package inspection. It intentionally does not run a
maximum-compression suite.

The first live tag is an integration check for the full external path: npm OIDC
publication, Oclif archive packaging, GitHub release creation, and the macOS
Homebrew tap smoke test. Watch that run rather than attempting a local publish.

Find the `release.yml` push run matching both the release tag and commit SHA,
then use `gh run watch <run-id> --repo ghaschel/squeezit --exit-status` to wait
for completion. Confirm a successful run and a non-draft GitHub release with
the assets below before reporting success.

## What the workflow publishes

For version `X.Y.Z`, the GitHub release receives these assets:

- `squeezit-vX.Y.Z-darwin-arm64.tar.gz`
- `squeezit-vX.Y.Z-darwin-x64.tar.gz`
- `squeezit-vX.Y.Z-linux-x64.tar.gz`
- `SHA256SUMS`
- `release-metadata.json`

`SHA256SUMS` verifies the three standalone archives. `release-metadata.json`
also records the npm tarball URL and SHA-256 used to render the Homebrew formula.
The archives include Node but no native optimizer binaries; that is why the
formula separately declares Node and the native tooling dependencies.

The Oclif packaging step needs an npm-compatible lockfile. It creates a
temporary `package-lock.json` only in the runner's `$RUNNER_TEMP` staging tree;
never add a package lockfile to this repository.

## Release flow and recovery

The workflow validates the immutable tag inputs first, publishes npm (or safely
skips an exact version already present), builds and verifies archives, then
creates or refreshes a **draft** GitHub release. It updates the Homebrew tap
only after that draft is ready and has passed a formula install plus `sqz
doctor --json` smoke test on macOS. Only then does it publish the GitHub release.

If a run fails before publication, fix the underlying problem and rerun the
same tag workflow. Reruns may resume an existing draft release, refresh its
notes, and replace its assets. A published release is deliberately not
overwritten: the validation step fails rather than attempting recovery. If the
tap update fails, the release remains a draft; correct the token, external tap
state, or runner issue and rerun failed jobs with
`gh run rerun <run-id> --repo ghaschel/squeezit --failed`. Changes to tagged
source, including formula generation, require a new version and tag. Never move
an already-pushed release tag.

## User installation notes

Homebrew users install and update with:

```bash
brew install ghaschel/tap/squeezit
brew upgrade squeezit
sqz doctor
```

The formula supplies Node and native optimizer tools. Users of standalone
GitHub archives should verify the downloaded archive with the release's
`SHA256SUMS`; the archive embeds Node but does not bundle native optimizer
tools, so `sqz doctor` is the authoritative setup check.

`sqz update apply` can select Homebrew only for a CLI that is already
formula-managed. It will not convert a globally installed npm/Bun package or a
standalone archive into a Homebrew installation; use `brew install
ghaschel/tap/squeezit` for that.

Development and CI builds use Node 26.13.0 (`.node-version`) and Bun
1.4.4 (`packageManager` and matching Bun types). Standalone archives retain Node
24.22.2 in `package.json` to preserve their existing Linux runtime requirements.
Public consumer support remains Node >=22.13.0. Validate packed ESM/CJS and CLI
artifacts on Node 22.13.0, 22.23.4, 24.22.2, and 26.13.0. Linux CI installs
`libatomic1` before selecting Node 26. Node 24 Actions need runner >=2.327.1
(>=2.329.0 for authenticated Docker Git); hosted release runners supply this.
Checkout credentials live under RUNNER_TEMP. Setup-node package-manager caching
is disabled explicitly in privileged release jobs; npm publishing uses OIDC.

## Documentation and compatibility records

The npm package includes the top-level Markdown guides in `docs/`. Plans under
`docs/plans/` and audit/validation records under `docs/maintenance/` remain
repository-only. The package-content test checks this boundary. Update the
[documentation index](README.md), [API reference](API.md), and [PDF guide](pdf.md)
when changing their public behavior; preserve historical release notes.

The separate compatibility workflow is manual-only (`workflow_dispatch`) to
avoid automatic GitHub Actions quota usage. Run it explicitly when platform
validation is needed. It builds with the development runtime, then
checks supported consumer Node and QPDF versions, including checksum-verified
QPDF source builds. It also exercises the retained host floors and includes an
Intel macOS lane. A configured workflow is not evidence of a completed run.
Review the [dependency and platform records](https://github.com/ghaschel/squeezit/blob/main/docs/maintenance/dependency-refresh/README.md)
and resolve any relevant outstanding gate before claiming that platform passed.
