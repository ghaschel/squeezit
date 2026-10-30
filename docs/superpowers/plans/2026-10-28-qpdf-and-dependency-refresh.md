# QPDF support and dependency refresh implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan; implementation is not part of the current change.

**Goal:** Add dependable lossless PDF optimization across Squeezit's CLI, JS/TS API, and all ten existing plugins, automatically skip protected documents, and refresh compatible dependencies with an explicit record of held upgrades.

**Architecture:** One QPDF inspection and compression module feeds the existing optimization engine. Protection checks precede writes and apply equally to files, staged buffers, dry runs, plans, and resumed work. Dependency modernization is an independently verified first stage; plugin adapters share the PDF policy rather than duplicating it.

**Tech Stack:** TypeScript, Bun, Node.js, Oclif, QPDF, Vitest, existing ten integration hosts, Homebrew and Debian/Ubuntu providers.

**Spec:** [Design and acceptance criteria](../specs/2026-10-28-qpdf-and-dependency-refresh-design.md).

**Dependency evidence:** [Version audit and upgrade decisions](2026-10-28-dependency-audit.md). Exact targets and held upgrades in that audit are inputs to Tasks 1–3, not permission to bypass compatibility checks.

## Global constraints

- Preserve the public consumer floor `engines.node >=22.13.0`; use a separately pinned modern Node runtime for development and release builds.
- Keep the public CLI taxonomy, API names, ten plugin entry points, ESM/CJS exports, and existing JSON envelope versions. Add `.pdf` and optional `skipReason`; do not rename image APIs.
- Skip every encrypted PDF, embedded signature, signature field, certification/timestamp/usage-rights indication, non-null trailer `/Prev` (including affected unsigned linearized PDFs), unsupported signing structure, and inconclusive inspection. No password or protection-bypass options.
- Inspect the exact snapshot being optimized, and verify the source fingerprint before committing an output. No persistent optimizer output on a protection skip.
- Retain PDF metadata for standard, max, and plugin calls. PDF metadata-only requests skip before ExifTool.
- Standard PDF Flate level is `6`; max evaluates `6` and `9` from the same original snapshot. Use object-stream `preserve` below PDF 1.5 and `generate` otherwise. Only validated candidates satisfying the existing threshold may replace inputs.
- QPDF target `12.4.2`, proposed compatibility floor `11.3.0`; verify the floor in CI before promising it. Use QPDF JSON v2 with stream payloads omitted.
- Supported platforms remain macOS and Debian/Ubuntu. Native version floors and approved test versions are distinct. Do not silently substitute libjpeg-turbo for MozJPEG.
- Commit only `bun.lock`. Do not commit npm/yarn lockfiles, publish packages, tag releases, push a tap, install global software, or upgrade unrelated host tools as part of preparing this plan.
- Before implementation run `bun run agent:preflight --json`, read its recommended skills, and resolve the Bun mismatch. Before Squeezit image operations follow the capabilities/doctor/preview requirements in `AGENTS.md`.
- Before each eventual commit, read `.claude/skills/committing-with-commitlint/SKILL.md`, print resolved Commitlint rules, and validate the full candidate message. Never disable Git hooks.

## Review focus

1. Protected or historically signed documents hidden behind indirect dictionaries, inherited fields, incremental updates, or unusual signing structures: skip conservatively, never infer safety from a string search or QPDF check alone. Covered in Tasks 4–6.
2. A PDF changed between inspection and replacement, or an existing output path on a skip: retain current bytes and avoid a misleading `wroteOutput: true`. Covered in Tasks 5–6.
3. An unrelated asset rename altering a protected PDF, an exhausted Parcel stream, or a Vinyl buffer differing from its disk path: preserve the actual supplied bytes. Covered in Tasks 7–9.
4. A dependency upgrade passing on modern CI but breaking the minimum consumer Node version, older supported peer hosts, CJS imports, or standalone packaging: test each supported boundary. Covered in Tasks 1–3 and 11.
5. Native encoder updates changing fixture sizes while content or metadata regresses: compare decoded content and supported metadata before accepting new size expectations. Covered in Tasks 3, 5, and 11.

## File responsibilities

| Area                               | Files                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency/runtime policy          | `package.json`, `bun.lock`, `.github/workflows/release.yml`, `scripts/agent-harness.ts`, `scripts/render-homebrew-formula.ts`, `docs/releasing.md`                                                 |
| Native providers                   | `src/core/dependencies.ts`, existing dependency/homebrew/release unit tests                                                                                                                        |
| New PDF logic                      | Create `src/core/pdf.ts`; add a focused internal QPDF runner there or `src/core/pdf-process.ts` if process bounds obscure classification logic                                                     |
| Shared orchestration and reporting | `src/utils/optimizer.ts`, `src/utils/discovery.ts`, `src/types/optimization.ts`, `src/types/api.ts`, `src/api/index.ts`, `src/core/index.ts`                                                       |
| CLI contract                       | Existing compression/metadata/plan/receipt commands, `src/cli/capabilities.ts`, applicable documentation and schemas                                                                               |
| Adapters                           | All ten files under `src/integrations/`; preserve existing `tsup.config.ts` entry points and package subpaths                                                                                      |
| PDF fixtures                       | Create `tests/fixtures/formats/pdf/`, `tests/helpers/pdf.ts`, `tests/unit/pdf.test.ts`, `tests/integration/api-pdf.test.ts`; extend fixture manifest and fixture README                            |
| Verification                       | Existing real-host integration tests, compiled CLI tests, docs/export/release checks; add a dedicated workflow for dependency/host compatibility if release jobs cannot express the matrix cleanly |

## Stage A: refresh dependencies before introducing PDF behavior

### Task 1: Make the development and release runtimes reproducible

**Files:** `package.json`, `.github/workflows/release.yml`, `scripts/agent-harness.ts`, `docs/agent-harness.md`, `docs/releasing.md`, relevant release/agent-harness tests; create `.node-version` if adopting it as the single development-runtime pin.

**Interfaces:** Consumes the audit's Bun, Node, action, and package engine recommendations. Produces an exact Bun pin, a development/release Node pin, a frozen install, and a documented Node consumer test matrix.

- [ ] Recheck official Bun/Node releases and npm metadata against the audit date; record only changed targets in the audit. Target Bun `1.4.4`, exact `@types/bun` `1.4.4`, and Node `24.22.2` for development/standalone. Validate Node `26.13.0` separately without automatically changing the embedded major. Keep the consumer floor independent.
- [ ] Add/update runtime configuration tests: all `packageManager`, setup-bun, setup-node, embedded Node, and documented values agree; no floating `latest` remains for `@types/bun`; consumer engines are unchanged.
- [ ] Run the focused tests and confirm they expose the stale pins. Then update the Bun pin and matching Bun types, development/runtime documentation, every workflow occurrence, and supported SHA-pinned actions from the audit. Account for action runner minimum versions and credential behavior.
- [ ] Use the selected Bun for `bun ci` and `bun run agent:preflight --json`. The Bun mismatch must disappear. Native missing-tool warnings remain explicit until Task 3; use the repository entry point rather than the shadowing global Squeezit installation.
- [ ] Run `bun run typecheck` and the agent-harness/release-configuration/release-workflow tests. Commit the coherent runtime change only after validation.

### Task 2: Upgrade npm packages and resolve the complete lockfile graph

**Files:** `package.json`, `bun.lock`, `eslint.config.mjs`, `vitest.config.ts`, `tsup.config.ts`, `tsup.oclif.config.ts`, `.lintstagedrc.json`, `.versionrc.cjs`, Oclif API call sites if the approved migration requires changes; relevant unit/CLI/export tests.

**Interfaces:** Consumes Task 1's toolchain. Produces the audited direct version targets, a freshly resolved transitive graph, unchanged public exports/CLI contracts, and an itemized unresolved-advisory/held-upgrade report.

- [ ] Apply compatible patch/minor targets first, preserving peer lower bounds. Keep paired versions aligned: React/react-dom, Vitest/coverage, Commitlint CLI/config, Parcel packages, and Oclif core/plugins/tooling. Add an explicit development TypeScript pin rather than relying on peer auto-installation.
- [ ] Run `bun install` with the selected Bun, then `bun ci`. Inspect all changed lock entries and peer/engine diagnostics; do not blindly regenerate the lock with another package manager. Update `@parcel/plugin` runtime availability if the package export audit confirms the current dev-only declaration leaves consumers without its runtime import.
- [ ] For each conditional major in the audit, add the relevant contract regression first and perform its bounded migration separately. Runtime changes must retain Node 22.13.0 support. Host major changes must retain existing supported peer behavior and receive a two-version real-host test before widening the peer range. Hold unsupported migrations explicitly instead of claiming the newest version is automatically safe.
- [ ] Review the complete resolved graph against npm advisories, engine constraints, direct peer contracts, optional platform packages, and deprecations. Trace advisories through their parent packages and prioritize runtime-reachable paths. Resolve through parent upgrades or narrowly justified compatible overrides; record remaining advisory ID, path, affected version, fixed range, and reason for holding.
- [ ] Run `bun run verify:agent`, `bun run build`, `bun run check:exports`, `bun run check:types`, `bunx --no-install eslint .`, and `bunx --no-install prettier --check .`. Verification does not currently include lint. Test ESM import, CJS require, public declaration consumption on supported TypeScript versions, and the compiled CLI on the Node consumer floor and Node 24 target. Use hooks normally for commits.
- [ ] Freeze the accepted version table. Anything failing a support boundary is reverted to its highest verified compatible version and listed under held upgrades; do not mark it updated merely because installation succeeded.

Perform the conditional migrations in these independently reviewed groups; do not mix their behavioral changes into one opaque lockfile commit:

| Group and targets                                                                             | Code/config to inspect                                                                                             | Required regression                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oclif core 5.1.10, autocomplete 4.0.6, not-found 4.0.7, CLI tooling 6.0.15                    | `src/cli/base-command.ts`, `src/cli/commands/`, `src/cli/capabilities.ts`, `tsup.oclif.config.ts`, release staging | Parser/help/taxonomy, JSON/events purity, autocomplete, manifest, missing-command behavior, and all three standalone archive layouts                                              |
| Execa 10.2.1, Chalk 6.0.1, Glob 14.0.3                                                        | `src/utils/exec.ts`, `src/utils/console.ts`, `src/utils/discovery.ts`, progress/output tests                       | Awaited process result/error shape, numeric FORCE_COLOR behavior, braces/extglobs/ignores/case-sensitive paths, and Node22.13 packed runtime                                      |
| TypeScript 6.0.3, typescript-eslint 8.72.1, tsup 9.0.0                                        | `tsconfig.json`, `eslint.config.mjs`, both tsup configs, declaration export checks                                 | Explicit compiler types where TS6 requires them; ESM/CJS declarations consumed by TS5 and TS6; full lint; no TS7 compiler substitution                                            |
| Vitest 5.0.5 and coverage-v8 5.0.5                                                            | `vitest.config.ts`, test mocks/lane selection                                                                      | Mock reset/discovery/coverage behavior, all expected suites still selected, no silently skipped tests                                                                             |
| Commitlint 21.2.4 pair, commit-and-tag-version 13.3.0, lint-staged 17.6.0, import-sort 14.0.0 | `commitlint.config.cjs`, `.versionrc.cjs`, `.lintstagedrc.json`, Git hooks, import ordering                        | Resolved custom type enum, ESM release-tool compatibility, dry-run changelog in disposable copy, real hooks with Git>=2.32, reviewed formatting-only changes                      |
| Babel 8.0.9 plus supported 7.x                                                                | `src/integrations/babel.ts` and Babel type imports                                                                 | Replace the hard v7 assertion with tested dual-major support; verify built-in Babel8 types, static reference rewriting, CJS consumer compatibility, and the existing Babel7 floor |
| Astro 7.4.4 plus supported 5.x; add 6.4.8 only if advertised                                  | `src/integrations/astro.ts`, Vite delegation, package peers                                                        | Build-hook lifecycle across environments, one optimization run, static PDF/image output, unsupported-server guard, supported old-host behavior                                    |
| esbuild 0.28.2 plus supported 0.27.x                                                          | `src/integrations/esbuild.ts`, binary installation and host peers                                                  | `onEnd`/write:false/failure behavior, loader/metafile output, platform binary availability                                                                                        |

### Dependency hold register

Use the audit's complete tables as the starting register. Definite exclusions today are TypeScript 7.0.2, ExifTool 13.60 development, unreleased Gifsicle 1.99, and incompatible forced transitive majors. Babel8/Astro7 and the other groups above are conditional migrations, not already proven holds or guaranteed successes. Preserve fallback versions and explain any failed gate in the final implementation report.

### Task 3: Refresh native tools, provider mappings, and release installation paths

**Files:** `src/core/dependencies.ts`, create `scripts/native-tool-targets.json`, `scripts/render-homebrew-formula.ts`, `.github/workflows/release.yml`, `README.md`, `docs/releasing.md`, `tests/unit/dependency-diagnostics.test.ts`, `tests/unit/homebrew-formula.test.ts`, release workflow tests, fixture manifest only after content validation.

**Interfaces:** Produces approved native versions and honest installation/version diagnostics. Existing format behavior remains unchanged; QPDF registration is added in Task 6.

- [ ] Add tests for the audit's version targets/provider limitations, Homebrew revision normalization, the new Oxipng Cargo pin and Rust prerequisite, and any source-install checksum changes. Store audited native targets and source receipts in `scripts/native-tool-targets.json` with `version`, `sourceUrl`, `sha256`, and `auditedAt` entries, consumed by source-install CI where applicable. Preserve `DEPENDENCY_CATALOG.minimumVersion` as a separate compatibility concept.
- [ ] Update eligible Homebrew-backed tools to the audit targets in the controlled validation environment. Keep macOS's system `file` provider. Keep libjpeg-turbo out of the MozJPEG slot. Record stable unchanged tools instead of inventing a version bump.
- [ ] Address the libheif security recommendation explicitly: validate the patched upstream target and either a verified distribution backport or an honest manual/source provider. Do not label a distribution package insecure solely by its upstream version, and do not claim `apt install` satisfies an unmet floor.
- [ ] Update release source installations and hashes together. Review version probes after upgrades, especially `heif-enc`, `avifenc`, `cjxl`, `dnglab`, `magick`, and provider-reported versions. Use the audit's pinned source receipts rather than copying an old checksum to a new version.
- [ ] Run dependency/Homebrew/release tests, then affected real image-format tests. Verify content and metadata before adjusting exact byte-size fixtures. Full max-profile verification is deferred to Task 11 and run once after all native changes.
- [ ] Record the macOS and Debian/Ubuntu readiness results separately, including unsupported packages and required manual installations. Commit the verified native refresh without publishing a release or pushing the Homebrew tap.

## Stage B: implement shared PDF behavior

### Task 4: Add PDF fixtures and the conservative read-only inspector

**Files:** create `src/core/pdf.ts`, `tests/unit/pdf.test.ts`, `tests/helpers/pdf.ts`, and `tests/fixtures/formats/pdf/`; update `tests/fixtures/README.md`.

**Interfaces:** Produces `PdfSkipReason`, `PdfInspection`, `inspectPdf(inputPath: string): Promise<PdfInspection>`, and `classifyPdfJson(value: unknown): PdfInspection` exactly as defined in the spec. No PDF writer is reachable from inspection.

- [ ] Create self-owned reproducible fixtures with provenance and checksums: ordinary compressible content with text/fonts/images/links/forms/bookmarks/attachments/Info/XMP; password encryption; empty-password permission encryption; signed/certified/timestamped documents; invalid signature; blank and inherited signature fields; indirect/object-stream dictionaries; incremental revisions; malformed and warning-producing PDFs. Include PDF bytes containing another build asset's path and non-UTF8 data.
- [ ] Add `pdf-inspection.test` cases in `tests/unit/pdf.test.ts` asserting each fixture/classification outcome, no password arguments, no writer/ExifTool calls, strict JSON-version checks, warnings/timeouts/output-cap handling, missing/incompatible executable behavior, and that exit `2` from encryption inspection never authorizes a write by itself.
- [ ] Run `bunx --no-install vitest run tests/unit/pdf.test.ts` and confirm the new inspector tests fail. Implement the shared QPDF runner and typed classification, with a per-run executable capability cache. Keep environment control, timeout, and output bounds local to the PDF path.
- [ ] Verify classification against the local QPDF target and the proposed minimum. Include a test where a signed historical revision is no longer exposed as a current field; reject non-null parsed trailer `/Prev`, including table and stream xrefs. Test that unsigned linearized files with `/Prev` receive an unsupported-structure skip, not a claim that they are signed. Do not treat a whole-file text search as the protection gate.
- [ ] Run the focused tests to green and commit fixtures/inspection as one testable unit.

### Task 5: Add lossless candidates and guarded core replacement

**Files:** `src/core/pdf.ts`, `src/utils/optimizer.ts`, `src/core/assets.ts`, `src/types/optimization.ts`, `src/types/api.ts`, `src/api/index.ts`; create `tests/integration/api-pdf.test.ts`, extend core/unit tests and `tests/helpers/fixture-manifest.ts`.

**Interfaces:** Consumes Task 4's inspection result. Produces `optimizePdfSnapshot({ inputPath, workDir, max, pdfVersion }): Promise<{ outputPath: string; label: string }>` and optional `skipReason` on core/API results. Existing status enums and API signatures are unchanged.

- [ ] Add failing tests for standard/max flags, PDF <1.5 object-stream preservation, exact snapshot inspection, removal of ambient `QPDF_ZOPFLI`, level-6/9 candidate selection, one-candidate failure/other-valid fallback, all-candidate failure, candidate-validation warnings, thresholds, unchanged/larger results, dry-run, keepTime, outputDir, source mutation during processing, and missing candidate output.
- [ ] Add failing metadata tests: `.pdf` and actual-PDF MIME inputs never reach ExifTool; `stripMetadata: true` and max retain PDF Info/XMP; metadata-only calls skip before workspace/output creation. A protected outputDir call must preserve both source and any existing destination and report `changed: false`, `wroteOutput: false`, measured unchanged sizes, and zero savings.
- [ ] Implement PDF routing before RAW/CUR extension overrides and the generic metadata-only branch; re-detect private staged bytes. Bind `input.absolutePath` to the snapshot SHA-256, dispatch only eligible snapshots, and recheck source identity before every publication. Expected protection/inspection skips return before the existing insufficient-savings copy-to-output path. For ordinary size skips, copy the inspected snapshot after the source check instead of rereading the live source. A distinct outputDir target is not the source fingerprint target. Follow the spec's result table for process versus document failures.
- [ ] Test preservation using decoded stream hashes, JPEG/JPX payload hashes, image dimensions, semantic object comparisons independent of renumbering, and expected metadata/forms/links/attachments. Use QPDF structure checking as one check, not the only check. Add a rendered-page comparison using an independent renderer in the PDF-specific validation environment; do not add that renderer as a production dependency.
- [ ] Run focused PDF/core tests with actual QPDF, plus `bun run typecheck` and `bun run test:fast`. Do not hardcode output sizes from an unrecorded QPDF build. Commit the shared pipeline only after all protection cases remain byte-identical.

### Task 6: Wire discovery, dependencies, CLI, plans, and receipts

**Files:** `src/utils/discovery.ts`, `src/utils/optimizer.ts` MIME/extension maps, `src/core/dependencies.ts`, `src/core/index.ts`, existing CLI commands/capabilities/result mappers; discovery/dependency tests and `tests/integration/cli-{json,contract-v2,events,plan,receipts,schema}.test.ts`.

**Interfaces:** PDF uses existing CLI commands and API flows. Dependency collection selects `file` and `qpdf` for compression, excludes PDF from metadata stripping dependencies, and reports the supported QPDF floor. Existing plan shape remains unchanged.

- [ ] Add failing discovery tests for `.pdf`, `.PDF`, globs, recursive directories, explicit filenames, generic MIME fallback, and protected PDFs named `.jpg`, `.cr2`, and `.cur`. They must still receive the shared PDF guard even if extension-based dependency preselection missed QPDF; prove they never reach ExifTool or a RAW/image encoder.
- [ ] Register `qpdf` with executable `qpdf`, version probe `--version`, Homebrew/APT package `qpdf`, and floor `11.3.0` once verified. Add doctor, install remediation, format-specific dependency, Homebrew-render, and missing/old QPDF tests. Do not add Ghostscript or `compress-pdf`.
- [ ] Propagate optional `skipReason` through API results, CLI JSON/events, and receipts. Confirm existing schemas accept the additive field; update any closed definition consistently rather than bumping envelope versions by habit. All-skipped runs remain successful with accurate skipped counts and zero savings.
- [ ] Test compiled CLI standard/max/dry-run/metadata paths, mixed batches, JSON stdout purity, unchanged receipt fingerprints, and source-change rejection. Plans remain read-only fingerprinted candidate lists; their inclusion of a PDF is not an eligibility decision. Apply always reinspects. Resume does not retry a prior skip and reinspects pending/interrupted inputs.
- [ ] Run `bun run test:cli`, focused plan/receipt/dependency tests, `bun run typecheck`, and normal manifest generation. Commit the complete CLI/API/dependency slice.

## Stage C: cover every existing plugin

### Task 7: Preserve PDF bytes through Gulp and Parcel streams

**Files:** `src/integrations/gulp.ts`, `src/integrations/parcel.ts`, `tests/integration/gulp.test.ts`, `tests/integration/parcel.test.ts`, `tests/unit/parcel.test.ts`; add focused Gulp unit cases if a real-host test cannot isolate byte-source selection.

**Interfaces:** Existing plugin options remain unchanged. Both adapters consume shared core results and emit either accepted optimized bytes or the exact original bytes.

- [ ] Add failing PDF tests for buffers, streams, and supported path-backed files. Cover a Vinyl buffer whose bytes differ from its path, a consumed Parcel Readable on skip, empty-password encryption, and a blank signature field. Assert exact output bytes, size, map/type, and filename.
- [ ] Add `.pdf` to both adapter filters. In Gulp prioritize supplied Buffer/stream contents over a disk path; retain null/path fallback. In Parcel return normalized original bytes after a consumed stream is skipped. Do not duplicate signature logic.
- [ ] Run `bun run test:gulp`, `bun run test:parcel`, and focused unit tests. Verify disabled/development paths remain no-ops and missing QPDF yields native host diagnostics.
- [ ] Commit the stream-safe integration change.

### Task 8: Make Babel cache publication and Grunt mappings honor skips

**Files:** `src/integrations/babel.ts`, `src/integrations/grunt.ts`, `tests/integration/babel.test.ts`, `tests/integration/grunt.test.ts`.

**Interfaces:** Babel's synchronous child returns a structured optimization result before persistent publication; Grunt retains its normal explicit source/destination mapping contract.

- [ ] Add failing tests for PDF import, require, and JSX `href` handling; protected/inconclusive PDFs must leave Babel references and existing cache paths untouched. Test repeated references, disabled/nonproduction mode, safe-PDF metadata retention, and native failure reporting.
- [ ] Stage Babel PDF work privately, invoke the shared API, and only publish a generated PDF/cache mapping when optimization is accepted. Capture a structured child result and parse it instead of inferring success solely from exit zero. Do not create a new public root API just to inspect signatures synchronously.
- [ ] Add `.pdf` to Grunt and test in-place protection skips and explicit destination copies. A mapped protected output must equal the original bytes and source must remain unchanged; normal destination-copy behavior is allowed and must not be reported as PDF optimization.
- [ ] Run `bun run test:babel`, `bun run test:grunt`, and typechecking. Commit the completed adapters.

### Task 9: Make Rollup PDF optimization and reference updates binary-safe

**Files:** `src/integrations/rollup.ts`, `tests/unit/rollup.test.ts`, `tests/integration/rollup.test.ts`.

**Interfaces:** Existing `optimizeAsset`, filename/hash helpers, and bundle hooks are retained. A protection skip never changes that asset's bytes or filename.

- [ ] Add a regression where an optimized image is renamed and a protected PDF contains the old image path plus non-UTF8 bytes. Assert the PDF remains identical for both Buffer and string-typed PDF sources, while actual JS/CSS/HTML/JSON references update as intended.
- [ ] Restrict nonchunk reference rewriting to an explicit set of textual reference-bearing asset types. Never scan/replace arbitrary binary assets or PDF source strings. Add `.pdf` to optimization discovery.
- [ ] Exercise real Rollup emitted safe/protected PDFs, hash-name/reference consistency, mixed assets, generate-only output, disk fallback, and disabled mode. Ensure already handled skipped bundle PDFs are excluded from fallback processing.
- [ ] Run focused Rollup unit tests and `bun run test:rollup`; commit after binary identity and reference assertions pass.

### Task 10: Exercise Vite, Webpack, esbuild, Astro, and Next.js

**Files:** existing five adapter files if needed; `tests/integration/{vite,webpack,esbuild,astro,next}.test.ts`, `tests/unit/astro.test.ts`; documentation fixture/config examples.

**Interfaces:** Vite/Webpack/esbuild consume shared discovery; Astro delegates to Vite, Next delegates to Webpack. No second PDF implementation or new plugin export is introduced.

- [ ] Add safe/protected PDF fixture cases to every real-host suite and update the generated asset rules/globs: Vite `?url`/noninlined output, Webpack `asset/resource`, esbuild file loader, Astro static asset link, and Next `next build --webpack` asset rule.
- [ ] Assert eligible output has preserved metadata/content and accepted size, protected output equals baseline bytes, references resolve, source inputs remain untouched, and disabled/failed/no-write paths retain current behavior. Include Vite/Astro public copied PDFs where supported.
- [ ] Preserve current host scope: disk outputs for Vite/Webpack/esbuild, Astro static builds, Next webpack output. Document that these post-write adapters do not recompute final-byte content hashes/SRI; do not advertise Rollup's in-memory hashing behavior for them. Do not claim Next Turbopack, runtime optimization, or public-directory support that the adapter does not implement.
- [ ] Run `bun run test:vite`, `bun run test:webpack`, `bun run test:esbuild`, `bun run test:astro`, and `bun run test:next`, including the oldest and newest host versions the refreshed peer ranges claim. Commit the complete real-host coverage.

## Stage D: document and verify the complete change

### Task 11: Prove compatibility, preservation, and package readiness

**Files:** `README.md`, `docs/API.md`, `docs/agent-contract.md`, `docs/releasing.md`, `package.json` package-file exclusions, `tests/unit/docs.test.ts`, applicable fixture expectations and compatibility workflow, companion audit.

**Interfaces:** Produces the final public PDF contract and the evidence for every accepted dependency update. No release publication is authorized by this plan.

- [ ] Update every global “always strips metadata” claim with the PDF exception, supported formats, QPDF dependency/install guidance, protected skip semantics, all ten plugin examples/limitations, and Parcel's PDF optimizer glob. Explain content losslessness versus file-byte identity, incremental/linearized-document skips, preservation of older PDF structural versions, absence of archival-conformance certification, and variable savings.
- [ ] Document all dependency holds with exact package/version, rejected target, concrete incompatibility, highest accepted target, and the validation needed to reconsider. Refresh the transitive advisory report after the final lockfile; unresolved entries must identify actual parent paths and must not be described as fixed.
- [ ] Exclude internal `docs/superpowers` planning/audit snapshots from the published package while retaining public API/agent/release documentation; add a package-content assertion. Run `bun run agent:preflight --json`, `bun run verify:agent`, `bun run test:integration`, `bun run build`, `bun run check:exports`, `bun run check:types`, `bunx --no-install eslint .`, `bunx --no-install prettier --check .`, and `npm pack --dry-run`. Check no unexpected artifacts/lockfiles or changed export entry points are included.
- [ ] Run the supported Node floor and modern Node matrix, QPDF floor/current matrix, and macOS/Debian provider tests. Capture unavailable platform verification explicitly rather than reporting it as passing.
- [ ] Run `bun run test:slow` once, serially, because the work updates native encoder versions and adds PDF max behavior. Inspect decoded-content/metadata evidence before accepting fixture size changes. A native failure blocks approval of its upgrade, not unrelated completed checks.
- [ ] Perform whole-change review against the spec's acceptance criteria and all five Review Focus cases. Confirm no password prompts/bypass path, no protected output mutations, no binary reference rewriting, and no untested narrowing of consumer compatibility.
- [ ] Present the accepted/held version report and validation results for review. Create commits using resolved Commitlint rules; do not tag, publish, or push a release without a separate release request.

## Planning validation already performed

- `bun run agent:preflight --json`: reported Bun pin mismatch and native-tool/global-installation readiness issues; no source changes made by the harness.
- `bun run typecheck`: passed against the existing installed dependency tree.
- `bun run test:fast`: 24 files, 176 tests passed against that same tree.
- Installed `qpdf --version` reports `12.4.2`; `qpdf --json-help` confirms the local structured inspection schema.
- Registry/formula/version audits and builder review inform this plan. Upgraded dependencies, new PDF behavior, and new plugin behavior have not yet been implemented or claimed to pass.
