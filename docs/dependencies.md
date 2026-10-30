# Optimizer dependencies

Squeezit uses external optimizer executables. `sqz deps doctor` checks their
compatibility minimums. `sqz deps install` installs missing tools. Use
`sqz deps upgrade` to install or upgrade tools to at least the tested targets
bundled with your installed Squeezit version.

```bash
sqz deps upgrade --dry-run
sqz deps upgrade
```

An interactive run shows the installed versions, targets, package commands,
and manual steps before asking for confirmation. For automation, review the
preview and then supply `--yes`:

```bash
sqz deps upgrade --dry-run --json
sqz deps upgrade --yes --json --receipt dependency-upgrade.json
```

Limit the operation to tools required by selected inputs:

```bash
sqz deps upgrade "documents/**/*.pdf" --dry-run
sqz deps upgrade "images/**/*.png" --profile max --dry-run
```

`--recursive`, `--profile standard|max`, and `--strip-meta` select the same
dependencies as compression. With no input patterns, the command checks all
24 executables. It does not compress the selected files.

## Targets and verification

Targets are upstream version floors for this command. Newer installed versions
are retained; this is not an exact-version pin or a downgrade operation. A
healthy compatibility check can still need an upgrade: QPDF 11.3.0 supports the
PDF pipeline, while the upgrade target is 12.4.2.

| Executables                                         | Target   |
| --------------------------------------------------- | -------- |
| `file`                                              | 5.41     |
| `qpdf`                                              | 12.4.2   |
| `jpegtran` (MozJPEG)                                | 4.1.5    |
| `jpegoptim`                                         | 1.5.6    |
| `pngcrush`                                          | 1.8.13   |
| `optipng`                                           | 7.9.1    |
| `zopflipng`                                         | 1.0.3    |
| `oxipng`                                            | 10.2.1   |
| `gifsicle`                                          | 1.98     |
| `svgo`                                              | 4.1.0    |
| `cwebp`, `dwebp`, `webpinfo`, `webpmux`, `gif2webp` | 1.6.0    |
| `heif-enc`                                          | 1.23.7   |
| `avifdec`, `avifenc`                                | 1.4.2    |
| `tiffcp`                                            | 4.7.2    |
| `magick`                                            | 7.1.2-34 |
| `exiftool`                                          | 13.55    |
| `dnglab`                                            | 0.8.0    |
| `cjxl`                                              | 0.12.0   |
| `icotool`                                           | 0.32.3   |

Homebrew suffixes such as `_1` identify formula packaging revisions, not
upstream binary versions. For example, a `jpeg-xl 0.12.0_1` installation can
report `cjxl 0.12.0`. The upgrade target comparison uses the upstream version. Once an executable
meets its bundled target, this command leaves it alone even if Homebrew offers
a newer formula revision or a shared dependency has a newer release. Target
bumps are maintenance changes shipped with Squeezit, not live version discovery
performed by this command.

After the package commands finish, Squeezit probes the selected executables
again. It succeeds only when all selected targets are verifiable and satisfied,
and every executed package command succeeded. An old executable earlier on
`PATH`, a pinned package, or an older distribution package can therefore cause
the operation to fail even if the package manager reports success. Provider-only
versions must correspond to the executable selected by `PATH`.

## Providers and limits

- macOS uses named Homebrew formula installs or upgrades, deduplicating tools
  supplied by one formula. It leaves the system `file` executable to macOS.
- Debian/Ubuntu uses named APT package installs/upgrades where the catalog
  supports them, and the pinned Cargo target for Oxipng. It does not run a
  system-wide `apt upgrade` or an unrestricted `brew upgrade`. Package managers
  resolve their dependencies and may update or repair other installed packages
  that share those dependencies. Squeezit does not select shared-library versions.
- Tools without an automatic provider receive manual instructions and remain
  unsatisfied until a suitable executable is installed. Squeezit does not
  silently build arbitrary upstream sources or replace unrelated installations.
- JSON, JSON Lines, and noninteractive mutations require `--yes`. Noninteractive
  APT commands use `sudo -n`; arrange the required privileges beforehand.
- A preview invokes no installer, needs no confirmation, and returns `ok: true`
  when planning succeeds. Inspect `data.ready` to determine whether targets are
  already met. An explicit `--receipt` still writes the requested receipt.
- Package-manager failure stops subsequent package commands and triggers a
  final inspection. Earlier successful package changes are not rolled back.

JSON results include `toolsBefore`, `toolsAfter`, planned `commands`, manual
`blocked` tools, `executed` command exit codes and captured output, `attempted`, `ready`, and
`dryRun`. Each tool retains its compatibility `minimumVersion` and adds
`targetVersion` and `targetStatus` (`current`, `outdated`, `missing`, or
`unverifiable`). Failed upgrades return exit code 1 and
`DEPENDENCY_UPGRADE_FAILED`. Dependency receipts record the outcome but cannot
be resumed as image operations; run the command again to inspect the current
environment and retry.

See the [automation contract](agent-contract.md) for envelopes and events,
and the [PDF guide](pdf.md) for QPDF-specific behavior.
