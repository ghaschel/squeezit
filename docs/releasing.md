# Releasing Squeezit

This guide is for maintainers of `ghaschel/squeezit`. Releases are published by
the GitHub Actions workflow at [`.github/workflows/release.yml`](../.github/workflows/release.yml),
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
The local release command verifies the branch, clean tree, remote configuration,
and tag availability before changing the version and creating a tag:

```bash
bun release
```

Review the generated commit, changelog, and tag. When ready, run the focused
release checks and push the release commit and tag:

```bash
bun run release:push
```

`release:push` runs locked dependency installation, typechecking, unit tests,
and package-export checks before `git push --follow-tags`. It intentionally does
not run a maximum-compression suite.

The first live tag is an integration check for the full external path: npm OIDC
publication, Oclif archive packaging, GitHub release creation, and the macOS
Homebrew tap smoke test. Watch that run rather than attempting a local publish.

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
tap update fails, the release remains a draft; correct the token, tap state, or
formula issue and rerun the workflow.

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
