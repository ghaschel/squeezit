# PDF support and dependency refresh

## Status

Implemented on 2026-10-30 in `859cc99`, with the dependency and validation
records preserved in the [maintenance report](../maintenance/dependency-refresh/README.md).
No release or publication was part of this work. Intel macOS execution remains
a CI gate; local Linux x64 evidence covers consumer smoke checks under emulation,
not a complete native-encoder matrix.

Use the [PDF guide](../pdf.md) for current behavior and the
[design record](pdf-support-design.md) for implementation decisions. The
[baseline audit](../maintenance/dependency-refresh/baseline-audit.md) records
pre-upgrade findings; the [resolved audit](../maintenance/dependency-refresh/dependency-audit.md)
and [hold register](../maintenance/dependency-refresh/dependency-holds.md)
record the accepted dependency graph.

## Purpose

Add dependable lossless PDF optimization to the CLI, JS/TS API, and all ten
existing integrations. Preserve content and metadata, skip protected or
inconclusively inspected documents, and refresh dependencies without narrowing
existing consumer support.

## Completed implementation

| Area                                   | Delivered behavior                                                                                                                     | Main implementation                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtimes and npm packages              | Bun 1.4.4, development/standalone Node 24.22.2, compatible dependency migrations, consumer Node >=22.13.0 retained                     | [package.json](../../package.json), [bun.lock](../../bun.lock)                                                                                    |
| Native tools                           | QPDF 12.4.2 target and tested 11.3.0 minimum; independent target receipts and compatibility floors; corrected provider guidance        | [dependency catalog](../../src/core/dependencies.ts), [native targets](../../scripts/native-tool-targets.json)                                    |
| PDF inspection                         | Immutable snapshot, clean recovery-disabled validation, structured JSON, encrypted/signed/history/XFA/inconclusive skips               | [PDF core](../../src/core/pdf.ts)                                                                                                                 |
| Compression and publication            | Independent Flate 6/9 candidates, candidate validation, thresholds, timestamps, dry runs, and source-change checks on writes and skips | [optimizer](../../src/utils/optimizer.ts)                                                                                                         |
| CLI, API, plans, receipts              | Existing names and schema versions retained, optional `skipReason`, reinspection on apply/resume                                       | [API](../../src/api/index.ts), [CLI commands](../../src/cli/commands)                                                                             |
| Gulp and Parcel                        | Supplied bytes take precedence; consumed streams preserve skipped bytes                                                                | [Gulp](../../src/integrations/gulp.ts), [Parcel](../../src/integrations/parcel.ts)                                                                |
| Babel and Grunt                        | Accepted-result cache publication; ordinary protected destination copies remain byte-identical                                         | [Babel](../../src/integrations/babel.ts), [Grunt](../../src/integrations/grunt.ts)                                                                |
| Rollup                                 | PDF assets and binary-safe text-reference updates                                                                                      | [Rollup](../../src/integrations/rollup.ts)                                                                                                        |
| Vite, Webpack, esbuild, Astro, Next.js | PDF coverage in each supported build lifecycle; static Astro and Webpack-based Next.js boundaries retained                             | [integrations](../../src/integrations)                                                                                                            |
| Native preservation fixes              | APNG animation retained; AVIF decoded samples and optional EXIF retained                                                               | [optimizer](../../src/utils/optimizer.ts), [native validation](../maintenance/dependency-refresh/README.md#native-tools-and-preservation-repairs) |
| Documentation and packaging            | Current PDF guide, API/automation documentation, public-guide packaging, and repository-only audit evidence                            | [documentation index](../README.md)                                                                                                               |

## Compatibility decisions

- Keep TypeScript 6.0.3 as the development compiler; TypeScript 7 remains held
  by the audited typescript-eslint support range. TypeScript 5/6 declaration
  consumers passed.
- Add Babel 8, Astro 7, and esbuild 0.28 compatibility while retaining their
  earlier supported host versions. All ten integrations passed exact floor and
  accepted-newest smoke checks; see [host boundaries](../maintenance/dependency-refresh/host-compatibility.md).
- Retain production ExifTool 13.55 and released Gifsicle 1.98. Do not adopt the
  audited development/unreleased targets or force incompatible transitive majors.
- Keep all native executables external. Native source checksums and targets do
  not imply every platform has an available bottle or a verified source build.
- Preserve image-oriented public names. No separate PDF-only plugins, password
  input, signature removal, or protection-bypass options were added.

## Validation results and remaining gates

The [maintenance report](../maintenance/dependency-refresh/README.md#validation-and-review)
records the exact commands, counts, source fingerprints, and limitations.

| Validation                                                                                              | Outcome                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent baseline, full integration checkpoint, build, lint, format, types, exports and package inspection | Passed; later PDF regressions were verified with the focused selection                                                                                   |
| PDF preservation and protection                                                                         | 72 tests passed on QPDF 11.3.0 and 12.4.2 on macOS ARM64                                                                                                 |
| Debian ARM64                                                                                            | 72 tests passed for each Node 22.13.0/24.22.2 × QPDF 11.3.0/12.4.2 combination                                                                           |
| Consumer artifacts                                                                                      | ESM/CJS/CLI checks passed on macOS Node 22.13.0/24.22.2/26.13.0 and emulated Linux x64 Node 22.13.0/24.22.2                                              |
| Integration host boundaries                                                                             | All ten exact retained floors and accepted newest versions passed real PDF builds                                                                        |
| Full slow lane                                                                                          | Initial run exposed size mismatches; changed expectations were accepted only after content checks, targeted reruns, and retained JXL output verification |
| Dependency advisory audit                                                                               | Zero matches in the recorded final graph; deprecated and parent-constrained versions remain listed individually                                          |
| Intel macOS and hosted Ubuntu                                                                           | CI configured; actual hosted executions were not completed locally                                                                                       |
| All native encoders on physical Intel macOS / Linux x64                                                 | Not established by the PDF or consumer smoke matrix                                                                                                      |

## Maintenance follow-up

Run the [compatibility workflow](../../.github/workflows/compatibility.yml) before
claiming the remaining platform gates. Re-audit version/advisory data when
refreshing dependencies; the checked-in records are dated evidence. Change a
native fixture expectation only after decoded content and relevant metadata
have been compared. Follow [AGENTS.md](../../AGENTS.md) for verification lanes
and normal Commitlint hooks; a documentation edit alone does not require the
slow compression lane.
