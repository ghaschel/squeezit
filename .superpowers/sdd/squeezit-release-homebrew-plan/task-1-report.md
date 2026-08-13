# Task 1 report — Release and Homebrew foundation

## Delivered

- Added `scripts/render-homebrew-formula.ts`, invoked as `bun scripts/render-homebrew-formula.ts --version <version> --sha256 <sha256> --output <file>`.
- The generated formula installs the npm tarball, derives unique alphabetically sorted Homebrew dependencies from `DEPENDENCY_CATALOG`, omits the system-provided `file` tool, depends on Node, uses `std_npm_args`, installs both `sqz` and `squeezit` aliases, and verifies the JSON version result.
- Added public npm provenance, explicit Bun package-manager metadata, Oclif embedded Node `24.16.0`, and exactly `darwin-arm64`, `darwin-x64`, and `linux-x64` Oclif archive targets.
- Added `release:check` and `release:push` scripts. The guard verifies the frozen Bun lockfile, typechecks, runs unit tests, and checks packed exports.

## TDD evidence

### Red

Added focused renderer and release-configuration tests before implementation, then ran:

```sh
bun test tests/unit/homebrew-formula.test.ts tests/unit/release-configuration.test.ts
```

Observed 4 expected failures:

- missing `publishConfig.provenance`
- missing `oclif.update.node` version and targets
- missing `release:check`
- missing `scripts/render-homebrew-formula.ts`

### Green

Implemented the renderer and package configuration, then reran the focused command:

```text
4 pass
0 fail
17 expect() calls
```

### Verification

```sh
bun run typecheck && bun run test:unit
bun run release:check
```

Both passed. The readiness guard reported 16 test files / 112 tests passing and completed `publint` successfully. `publint` emitted one non-blocking suggestion that the existing repository URL could use a `git+https://` prefix; it was not changed because it is outside Task 1's scope.

## Scope checks

- Kept the published Node engine floor at `>=22.13.0`.
- Did not change the package version.
- No `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` was added; `bun.lock` remains the sole committed lockfile.
- Did not add the tag workflow, updater changes, or documentation work owned by later tasks.

## Review fix — nested version JSON

Review identified that `sqz version --json` returns the version under `data.version`, while the generated formula test read the JSON root. The formula test was strengthened first to require:

```ruby
JSON.parse(shell_output("#{bin}/sqz version --json")).dig("data", "version")
```

The focused test failed as expected against the old root-level lookup, then passed after updating the renderer template:

```text
1 pass
0 fail
12 expect() calls
```
