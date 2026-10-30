# PDF support and dependency refresh — implementation report

Implementation branch: `codex/qpdf-dependency-refresh`, based on `af 41b 7a`.
This implements the approved [plan](2026-10-28-qpdf-and-dependency-refresh.md)
and [design](../specs/2026-10-28-qpdf-and-dependency-refresh-design.md).
No release, tag, publication or push is included.

Implementation commit: `859cc99`. Formatting-only commit: `e11ce15`.

## Delivered behavior

One QPDF pipeline serves the API, CLI and all ten existing adapters. Content
detection precedes image-specific extension handling, including misleading
`.jpg`, `.cr 2` and `.cur` names. The pipeline inspects an immutable snapshot and
checks the original source again before publishing. Protected or inconclusively
inspected PDFs preserve both the source and any existing destination.

Encryption, signature dictionaries/fields, timestamps, certification permissions,
XFA and parsed trailer `/Prev` cause conservative skips. Empty-password and
permissions-only encryption also skip. `/Prev` intentionally excludes some
unsigned incremental and linearized documents. Inspection uses recovery-disabled
validation and bounded JSON object inspection, with separate executable/version/
JSON capability checks. Disabling dependency prechecks does not bypass these
checks. There is no password, signature-removal or force option.

Standard compression uses Flate 6. Max independently generates Flate 6 and Flate 9
candidates from the snapshot and selects the smallest valid result. Older PDFs
retain their object-stream behavior; PDF 1.5+ may use generated object streams.
Ambient `QPDF_ZOPFLI` is removed from the process environment. There is no image
resampling, lossy re-encoding, flattening, decryption or PDF metadata removal.
Metadata-only PDF calls skip without QPDF or ExifTool. Existing API names, result
statuses, plan shapes and JSON contract versions remain; `skipReason` is additive.

Gulp prioritizes supplied bytes, Parcel preserves consumed stream bytes on skips,
Babel publishes cache files/references only after accepted optimization, and
Rollup restricts reference replacement to text assets. Grunt retains ordinary
byte-for-byte destination-copy behavior. Vite, Webpack, esbuild, Astro static
builds and Next Webpack builds share the existing output lifecycles. Astro 7
requires final-output processing in `astro:build:done`. Gulp 5 callers must use
`encoding: false` for binary inputs. Existing post-write filename/hash limits,
unsupported Next Turbopack and unsupported Astro server rendering are documented.

## Dependency acceptance and holds

The project pins Bun 1.4.4 and matching Bun types. Development, CI and standalone
Node use 24.22.2; consumer support remains `node >=22.13.0`. Validation used
isolated matching runtime binaries; the user's global Bun/Node installation was
not replaced. Only `bun.lock` was regenerated. A fresh frozen install passed.

All intended direct package upgrades were accepted, including Oclif 5/plugins 4,
Chalk 6, Execa 10, Glob 14, tsup 9, Vitest 5, Commitlint 21, lint-staged 17 and
commit-and-tag-version 13. Babel 8.0.10, Astro 7.4.4 and esbuild 0.28.2 passed their
host checks while retaining the older advertised majors. TypeScript 6.0.3 passed
compiler, lint, declarations and consumer checks. TypeScript 5 remains supported.
The final lock resolves ESLint 10.14.0 and Babel 8.0.10, compatible newer releases
than the original audit targets. Parcel's exported integration now correctly
declares `@parcel/plugin` as a runtime dependency.

The [final audit](2026-10-30-final-dependency-audit.md) covers all 1,476 lock entries,
1,320 distinct resolved versions and 1,190 package names. Fresh exact-version and
latest registry metadata requests completed with zero errors. Of 57 direct names,
56 are at current registry latest. The [machine inventory](evidence/2026-10-28/final-dependency-audit-2026-10-30.json)
records every direct declaration, installed version, previous version and role.

| Held dependency                 | Installed/accepted            | Rejected target       | Reason and remaining exposure                                                                                                                                          |
| ------------------------------- | ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                      | 6.0.3                         | 7.0.2                 | typescript-eslint 8.72.1 requires `<6.1.0`; reconsider after compiler/lint/declaration/consumer compatibility. No matched advisory.                                    |
| ExifTool                        | 13.55, Homebrew revision 1    | 13.60                 | Development release; retain the audited production release.                                                                                                            |
| Gifsicle                        | 1.98                          | 1.99                  | Unreleased at audit time; retain released 1.98.                                                                                                                        |
| Parent-constrained npm versions | 335 versions across 285 names | Each registry latest  | Every version, latest target and blocking parent range is listed in the [readable hold register](2026-10-30-dependency-holds.md). No incompatible transitive override. |
| Grunt's Glob                    | 7.1.7                         | 14.0.3                | Latest Grunt 1.6.3 still owns `glob@~7.1.6`. Deprecated/unsupported old major; development host graph. No matched advisory in the final audit.                         |
| Grunt's inflight                | 1.0.6                         | No newer release      | Glob 7 owns `inflight@^1.0.4`. Deprecated with a memory-leak notice; removal needs a parent migration. No matched advisory.                                            |
| ATTW's compiler                 | 5.6.1-rc                      | Newer compiler majors | Declaration-analysis tooling intentionally pins its own compiler. It is separate from Squeezit's 6.0.3 compiler; see the exact owner in the hold register.             |

Final `bun audit --json` returned `{}`: zero advisory matches. This is a registry
match at the recorded audit time, not proof of exploit-free software. The complete
graph's engine constraints include development/platform packages requiring newer
Node; the installed runtime closure had 265 instances and no engine excluding
Node 22.13.0. Strict all-host declarations expose upstream host/@types issues;
all 11 ESM/CJS consumer entry points pass under the existing `skipLibCheck` policy
on TypeScript 5.9.3 and 6.0.3, and the root public API also passes the stricter check.

## Native tools and preservation repairs

All 24 catalog executables diagnose healthy on local macOS arm64. The approved
[source manifest](../../../scripts/native-tool-targets.json) records 18 source
groups with version, URL, checksum, audit date and receipt. Compatibility floors
remain separate from tested target versions. QPDF 12.4.2 is the current target;
11.3.0 is the tested minimum. Poppler is a test-only independent renderer.

| Native group                | Accepted local target             |
| --------------------------- | --------------------------------- |
| QPDF                        | 12.4.2, Homebrew revision 1       |
| MozJPEG / jpegoptim         | 4.1.5 / 1.5.6                     |
| pngcrush / OptiPNG / Zopfli | 1.8.13 / 7.9.1 / 1.0.3 revision 1 |
| Oxipng / Gifsicle / SVGO    | 10.2.1 / 1.98 / 4.1.0             |
| WebP / libheif / libavif    | 1.6.0 / 1.23.7 / 1.4.2            |
| libtiff / ImageMagick       | 4.7.2 / 7.1.2-34                  |
| ExifTool / DNGLab           | 13.55 revision 1 / 0.8.0          |
| JPEG XL / icoutils          | 0.12.0 revision 1 / 0.32.3        |
| macOS system file           | 5.41; retained system provider    |

Homebrew changes were limited to requested Squeezit tools and their required
dependencies. Missing MozJPEG and JPEG XL were installed. No unrestricted
Homebrew upgrade occurred. libheif 1.23.7 satisfies the audited upstream security
recommendation; Debian's 1.23.6 backport coverage remains unverified, so no claim
is made that the distro version is vulnerable or equivalently patched.

Debian packages missing or below supported floors now receive honest source,
manual or npm guidance. Oxipng's Cargo path pins 10.2.1 and Rust>=1.88. Source
installs verify receipts; genuine MozJPEG is never substituted with libjpeg-turbo.

Native content validation found and repaired two existing preservation defects:

- APNG's Oxipng `--strip all` discarded animation. Animated inputs now use safe
  stripping. All 80 frames, timing and decoded RGBA hashes match.
- AVIF's ImageMagick PNG intermediate changed 12-bit samples. The pipeline now
  uses `avifdec --depth 16` and explicitly forwards EXIF when metadata is retained.
  Native YUV12 hashes, XMP, ICC and injected EXIF metadata match. `avifdec` shares
  the existing libavif provider and minimum version.

Exact image-size fixtures were updated only after decoded-content evidence.
[Default native evidence](evidence/2026-10-28/native-validation-2026-10-30.json)
and [max evidence](evidence/2026-10-28/native-max-validation-2026-10-30.json)
record pixel/frame/RAW sample comparisons and accepted sizes.

## Validation and review

The completed local checks include:

- `verify:agent`: typechecking, 214 fast tests, 76 CLI tests, 10 agent tests, export
  validation and package inspection passed at the aggregate checkpoint.
- Full integration lane: 41 files, 216 tests passed, including all ten real hosts.
- Current/minimum QPDF: all 72 core, process, API, authentic-signature and preservation tests
  passed on both 12.4.2 and 11.3.0 after the final review fixes.
- Build, publint, ATTW type checks, explicit whole-repository ESLint and Prettier,
  and frozen Bun installation passed. Additional package-content regression
  verifies public docs ship while internal plans/audit evidence do not.
- Node 22.13.0, 24.22.2 and 26.13.0 ran built ESM/CJS imports and compiled CLI smoke
  checks on macOS arm64. TypeScript 5.9.3/6.0.3 consumed all 11 exported entry points.
- All ten real hosts passed both their exact retained floor and accepted newest
  version using the same PDF build runner. The [boundary evidence](2026-10-30-adapter-host-boundary-evidence.md)
  lists all 20 checks, exact dependency manifests and reproduction commands.
- Authentic self-signed detached CMS signatures are independently verified with
  OpenSSL. Tampering, expired certificates, certification structures and document
  timestamp markers still skip. The timestamp fixture is explicitly synthetic;
  this does not claim a trusted timestamp authority or trusted CA chain.
- PDF content checks compare decoded page streams, raw JPEG payloads, Info/XMP,
  form values, links, bookmarks, attachments, compressed JPX payloads, embedded
  TrueType programs and independent Poppler renders. Five added preservation
  tests also cover in-place/output-directory timestamps and original-byte
  threshold copies; these pass beyond the 216-test full integration checkpoint. Four further process tests cover
  concurrent source changes on skip paths; these also pass in the 72-test selection.
- The complete serial slow lane ran once: 10 passed and 11 exact-size assertions
  failed. After preservation validation and the APNG/AVIF repairs, the 10 affected
  non-JXL cases passed a targeted Vitest rerun. The retained actual JXL output
  passed the same four fixture assertions and independent decoded-pixel checks.
  This is not reported as a second all-green full slow run.

Independent review exposed three PDF safety gaps, each reproduced and fixed:
stale source size before snapshot creation, insufficient JSON page-tree validation,
and a missing independent executable JSON-capability probe. Final review found
one reporting error: threshold-skipped dry runs with an output directory reported
`wroteOutput: true`. Single/batch API conversion now carries the dry-run context;
the exact regression passed and the reviewer approved the fix. A final contract
check reproduced four source-change cases that returned skips without publication.
Protected, inconclusive and threshold skip paths now also recheck source identity
and report an operational failure on a change. All four regressions and the full
72-test PDF selection passed; scoped independent review approved this final fix.

Formatting changes to historical changelogs are mechanical consequences of the
updated Prettier version. Internal audit JSON is excluded from formatting and
published package contents. Product source, public documentation and tests remain
covered by lint/format checks. Private signing keys were never checked in.

The native Linux ARM64 matrix passed all 72 PDF tests for each combination of
Node 22.13.0/24.22.2 and QPDF 11.3.0/12.4.2 (288 test executions), plus built ESM/CJS
and CLI JSON smoke checks. QPDF sources and runtimes were checksum-verified in
an isolated Debian 13 container; root dependencies and lockfile were not changed.
Emulated Linux x64 separately passed built ESM/CJS and CLI smoke checks on
Node 22.13.0 and 24.22.2 with a frozen production-only install. This establishes
x64 consumer loading and CLI behavior, not an x64 QPDF/native-encoder run.
[Platform receipts, exact source fingerprints and reproduction scripts](evidence/2026-10-28/platform-validation-2026-10-30.json)
record the distinction and the unexecuted platform gates.

Intel macOS execution must not be inferred from ARM or Linux results. The official
`macos-26-intel` QPDF source-build lane is configured as a CI gate and has not run
locally. The manifest and configured lane do not prove every native optimizer
builds on Intel macOS. This remains an explicit platform validation limitation.

## Decisions made during implementation

These are the four implementation rulings, in the order they were made:

1. The app-created worktree was outside the writable sandbox, so implementation
   used the dedicated branch in the original checkout. The tradeoff is sharing
   that checkout's working files; existing files were preserved and the final
   changes are committed. The attached worktree receives the completed commit
   for review.
2. Independent dependency, native-tool and adapter tasks used subagents while
   the parent owned the shared PDF pipeline. Coordination errors would have
   caused incompatible interfaces or missed verification; shared integration
   tests and independent review checked the combined result.
3. Native validation justified fixing APNG animation loss and AVIF sample/EXIF
   preservation before accepting new fixture sizes. This adds an `avifdec`
   requirement and changes expected compressed sizes. If the decision were
   wrong, users could face an unnecessary dependency or preservation regression;
   decoded-frame/sample and metadata comparisons support the change.
4. Historical changelogs received mechanical formatting to pass the upgraded
   formatter. The cost is additional historical diff noise, isolated in its own
   commit. Generated audit JSON is excluded from formatting, while product code,
   tests and public documentation remain checked.
