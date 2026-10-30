# Optimizer upgrade command and dependency maintenance

Status: implemented; local validation complete. Evidence collected 2026-10-30.

This record supplements the [previous dependency refresh](../dependency-refresh/README.md).
The [dependency guide](../../dependencies.md) describes the current command.

## Accepted scope

`sqz deps upgrade` brings selected optimizer executables to the upstream targets
bundled with Squeezit. At-target and newer executables are a no-op. Formula
revisions and newer shared-library releases do not trigger upgrades. Homebrew
resolves dependencies and dependent repairs when an optimizer actually needs an
install or upgrade. Those libraries are not separately managed by Squeezit.

The audit checked all 18 direct Homebrew formulae, their runtime dependency
closure, all 57 direct npm dependencies, and the original 1,476 lock locations.
All 18 optimizer upstream targets were already the audited stable releases, so
this maintenance pass does not change `scripts/native-tool-targets.json`.
The 13 available indirect Homebrew updates in the audit are historical findings,
not installation targets or claims of updates performed by this work.

## Applied project changes

- Rollup 4.66.0 → 4.67.2, with matching native platform packages and the new
  Android x64 optional package.
- The compatible AWS SDK cohort → the audited releases, including clients
  3.1161.0, core 3.979.1, and the corresponding credential/token providers.
- electron-to-chromium 1.5.468 → 1.5.469 and @types/estree 1.0.9 → 1.0.10.
- tslib 2.8.1 → 2.9.1: this stable release appeared at 20:26 UTC after the
  initial audit. Its official release notes and registry metadata were checked
  during installation; it stays within existing parent ranges.
- Align the @astrojs/markdown-remark declaration with already resolved 7.3.5.
- Development/CI Node 24.22.2 → 26.13.0. Preserve standalone Node 24.22.2,
  public Node >=22.13.0 support, Bun/Bun types 1.4.4, and reviewed Action SHAs.
  Linux CI installs libatomic1 before selecting Node 26.

The regenerated lock contains 1,477 locations: 45 existing version updates and
one added platform package. No package was removed, no major was forced, and
resolved dependency/peer ranges remain valid. Only `bun.lock` was regenerated.
A clean temporary `bun ci --ignore-scripts` installation reproduced the lock
without modifying it. Installation scripts were disabled for that isolated
check because the project postinstall records global installer configuration;
builds, CLI tests, and normal package lifecycle validation run separately.

## Holds and advisory exposure

| Package or group                           | Installed/retained                       | Newer audited release | Reason and exposure                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                 | 6.0.3                                    | 7.0.2                 | typescript-eslint 8.72.1 requires >=4.8.4 <6.1.0; keep the supported compiler. No npm advisory match.                                                                                              |
| Standalone Node                            | 24.22.2                                  | 26.13.0               | Preserve existing archive runtime requirements; Node 26 Linux binaries require libatomic. Development uses 26.13.0.                                                                                |
| ExifTool                                   | 13.55 (Homebrew revision 1)              | 13.60 development     | Retain the production release. The 13.59 filename-extraction security fix concerns `-W`/`%o` paths absent from Squeezit's metadata-removal invocation; no demonstrated exposure through that path. |
| Gifsicle                                   | 1.98                                     | 1.99 unreleased NEWS  | No released upgrade at audit time.                                                                                                                                                                 |
| Parent-constrained transitive dependencies | 316 distinct retained name/version pairs | Per-package inventory | Parent ranges and declaration-analysis pins prevent independent upgrades. All 423 affected lock locations, versions, newer releases, and parent ranges are recorded below.                         |
| Grunt legacy dependencies                  | glob 7.1.7, inflight 1.0.6               | Parent-constrained    | Deprecated; Grunt pins glob exactly. Inflight's published memory-leak deprecation remains. No matching npm advisory in the final query.                                                            |

The final `bun audit --json` response was `{}`. This is a point-in-time advisory
match result, not proof that no vulnerability exists. The native audit identified
security fixes in newer indirect jpeg-turbo/c-ares releases; the local receipts still report jpeg-turbo 3.2.0 and c-ares 1.34.8.
The newer releases contain security fixes (including CVE-2026-75466 for
jpeg-turbo); affected-path reachability through Squeezit has not been
demonstrated. This command intentionally does not force those library updates
when optimizer targets are already satisfied. Shared-library update policy remains with Homebrew.

The optional non-host @img/sharp-win32-ia32 0.35.5 record advertises Node ^20.9.0.
It is outside the supported macOS/Linux host and production dependency closure.
No supported-platform runtime failure has been demonstrated from this record.

## Evidence and validation

- [Validation summary](2026-10-30-validation.json): final commands, results,
  review fixes, and explicit platform limits.

- [Final npm audit](2026-10-30-npm-audit.json): direct versions, applied lock
  changes, graph checks, holds, deprecations, and advisory result.
- [Complete parent constraints](2026-10-30-parent-constraints.json): every
  retained older lock location, installed/latest versions, and blocking parents.
- [Native audit snapshot](2026-10-30-native-audit.json): the earlier direct,
  transitive, upstream, platform, checksum, and distribution evidence.
- [Installed optimizer check](2026-10-30-installed-tools.json): all 24 local
  executables meet targets and the command plans zero installer operations.
- [tslib release receipt](2026-10-30-tslib-release.json): upstream release notes
  for the additional in-range update discovered during implementation.

The earlier disposable-copy result of 495 tests belongs to the candidate graph
and then-installed native stack. It does not validate subsequently installed
libraries, this final command, or the additional tslib update.

Final command tests cover missing/outdated tools, satisfied/newer no-ops, shared
provider deduplication, failed installers, stale PATH selection, numeric version
paths in failed launches, multiple installed Zopfli kegs, confirmation, JSON,
events, and receipts. The workflow retains QPDF 11.3.0/current and integration
host-floor checks, and expands Node coverage to 22.13.0, 22.23.4, 24.22.2, 26.13.0.
Intel macOS and Linux execution remain CI validation requirements; this local
Apple Silicon session cannot establish their results. No new CI run is implied
by editing the workflow. No global optimizer upgrade was performed. Release delivery was authorized
after local validation and is tracked separately from these implementation checks.

### Final local checks

- `verify:agent`: fast 234 tests, compiled CLI 84, agent workflows 10; typecheck,
  exports and package inspection passed. The sandbox emitted a Husky Git-config
  permission warning during prepack; package inspection was rerun successfully
  with normal lifecycle hooks and the required repository access.
- `test:integration`: 43 files, 234 tests passed (includes the configured CLI
  selection as resolved by this Vitest version).
- All ten exact integration host floors passed on Node 24.22.2.
- 11 public ESM and CJS exports plus compiled CLI checks passed on Node 22.13.0,
  22.23.4, 24.22.2, and 26.13.0; see [runtime smoke results](2026-10-30-node-smoke.json).
- ESLint, changed-file Prettier checks, declaration checks, and `git diff --check`
  passed. The packed package contains 124 files; maintenance/planning records
  remain excluded.
- [Frozen installation proof](2026-10-30-frozen-install.json) records the final
  lock hash and an unchanged fresh installation.
- A real compiled `sqz deps upgrade --json` run reported all 24 targets satisfied,
  no confirmation needed, no commands, and no attempted installation.
- Serial `test:slow`: stopped at the user's explicit request because of its
  duration (exit 130). Max-profile tests are excluded from this task's acceptance
  checks; no passing result is claimed.
