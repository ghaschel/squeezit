# QPDF support and dependency refresh design

Status: implemented design. Prepared 2026-10-28 and validated during implementation on 2026-10-30. See the [implementation record](pdf-support-and-dependency-refresh.md), [current user guide](../pdf.md), and [validation report](../maintenance/dependency-refresh/README.md).

## Intent and agreed scope

Add lossless PDF optimization to Squeezit using the QPDF executable. Support well-formed PDFs, automatically leave encrypted and digitally signed documents alone, and expose the same behavior through the CLI, existing JS/TS API, and all ten existing integration entry points. Audit and refresh the Node packages, Bun pin, native tools, Homebrew integration, and release runtimes without silently narrowing supported consumer environments.

The supported scope is dependable detection for well-formed PDFs with conservative protection skips. The conservative implementation choices below extend that requirement to empty signature fields and inconclusive inspection. They do not promise verification of signature authenticity or detection of detached signatures stored outside the PDF.

## Approach

Use QPDF directly through a small shared PDF module. The project already owns native dependency detection, process invocation, temporary workspaces, replacement thresholds, and result reporting. An npm Ghostscript wrapper would duplicate those facilities and would not satisfy the content-preservation requirement. A second PDF parsing library would add another interpretation of document security; QPDF's structured JSON is sufficient for the bounded inspection described here.

Keep existing exported names, including `optimizeFile`, `optimizeFiles`, `stripMetadata`, and `SupportedFormat`. Extend their behavior additively; do not rename the image-oriented API or add ten redundant PDF-specific packages. Existing plugins gain PDF support through their existing entry points.

Implement the dependency refresh as a separately verifiable stage before PDF support. Major dependency releases are candidates only when their required migration preserves Squeezit's public behavior and support matrix. An available version is not automatically a compatible version.

## PDF eligibility and protection policy

The shared core classifies the exact private snapshot it will optimize before invoking any QPDF write operation. Normal source files, explicit API output destinations, and existing build assets remain unchanged on protection skips. A build tool may still perform its ordinary byte-for-byte copy or emit operation; that is different from Squeezit rewriting the PDF. Protected PDFs do not acquire optimizer-generated Babel cache files or rewritten import paths.

1. Discover `.pdf` case-insensitively and recognize `application/pdf`. Extension fallback makes an input eligible for inspection, not automatically eligible for optimization. PDF recognition must precede RAW-extension shortcuts, CUR overrides, and the metadata-only branch. Re-detect the staged bytes so a stale original-path detection cannot send a PDF through an image writer.
2. Resolve QPDF and verify its supported version and JSON capabilities in the shared PDF path, including when a caller disables the optional dependency precheck. Cache a successful probe within a run, keyed by the resolved executable. Missing or incompatible executables produce the existing dependency/failure behavior, not a fabricated protected-file skip.
3. Detect encryption with `qpdf --is-encrypted`. Exit `0` means skip, including empty-user-password documents with permission restrictions. Exit `2` is only a candidate for further inspection; it is never sufficient proof that a file is safe, since process failures need separate handling. Never request or accept a password, decrypt a document, or change encryption permissions.
4. Require a clean read-only `qpdf --suppress-recovery --check` result and valid QPDF JSON v2 with no warnings. Parse `encrypt`, `acroform`, `pages`, and the complete `qpdf` object dictionaries, with stream payloads omitted. Validate the page summary before deriving `pageCount`. Missing fields, document parsing failures, recovery, warnings, unsupported JSON versions, timeouts, or an exceeded output limit cause an inspection skip; unavailable execution is a failure as specified in the outcome table. Never combine this check with a rewrite.
5. Reject any encryption dictionary or `encrypt.encrypted` indication. Reject a non-null `/Prev` in the parsed trailer as `pdf-unsupported-structure`: QPDF's current-object view cannot rule out signatures in superseded revisions. This deliberately also skips linearized PDFs that expose `/Prev`; do not claim those files are signed. Inspect dictionary structures and resolved field inheritance, not text matches in raw PDF bytes. Skip `/FT /Sig`, `/Type /Sig`, `/Type /DocTimeStamp`, a signature `/ByteRange`, nonzero `/SigFlags`, or non-null catalog `/Perms`. This covers filled and empty fields, invisible signatures, certification, document timestamps, and usage-rights signatures conservatively. Inspect nested dictionaries and indirect objects, including unreferenced objects present in the JSON representation. A missing `/Type` does not exempt a signature dictionary. Skip `/XFA` documents rather than pretending this feature interprets XML signing structures.
6. Bind `input.absolutePath` to a PDF-specific SHA-256 fingerprint and require the completed snapshot to have the same digest before inspecting it. Recheck that source before every inspected skip and immediately before every publication, including insufficient-savings output copies. Copy from the inspected snapshot rather than rereading live source bytes. A distinct outputDir destination is not compared to the source digest. Reuse plan/resume guards and add this behavior for ordinary API/CLI PDF calls. A changed source is a failure with no replacement. These are optimistic change checks, not an atomic guarantee against another process writing between the final check and replacement.

No password, force-protected, or ignore-signature option is added. A graphic of handwriting is ordinary page content and is not a cryptographic signature.

QPDF supports read-only encryption inspection without a password and exposes complete PDF object dictionaries in JSON v2. Signature detection is the application policy built on that representation; QPDF's `--check` is not cryptographic signature validation. See [QPDF inspection options](https://qpdf.readthedocs.io/en/stable/cli.html#pdf-inspection) and [QPDF JSON](https://qpdf.readthedocs.io/en/stable/json.html).

## Compression and preservation

Use these common rewrite flags on eligible snapshots, with an explicit temporary output file:

```text
--object-streams=<preserve or generate>
--compress-streams=y
--decode-level=generalized
--recompress-flate
--compression-level=<6 or 9>
```

The standard profile uses level `6`. The max profile evaluates levels `6` and `9` independently from the same original snapshot and keeps the smaller valid candidate. When both candidates complete successfully, max is at least as effective as standard for the same QPDF build without introducing a lossy transformation. If only one validates, use that candidate; if neither validates, report a failure without writing so receipts can retry it. Do not set `QPDF_ZOPFLI`; behavior must not depend on an ambient environment variable. The PDF runner removes that variable from its child environment. Zopfli integration is outside this first PDF feature.

Do not use image optimization, JPEG quality changes, downsampling, content normalization, page selection, flattening, metadata removal, decryption, or a forced PDF version. Preserve text, fonts, image samples, attachments, form values, links, bookmarks, and Info/XMP metadata. Select `--object-streams=preserve` for a header version below 1.5 and `generate` for 1.5 or newer. This avoids introducing PDF 1.5 object streams into older documents, including PDF/A-1 files; it is not certification of archival or print-standard conformance. Structural reorganization and removal of orphaned objects mean output is not a byte-for-byte encoding of the original container.

PDF compression deliberately ignores the image-oriented `stripMeta` flag, including when max mode or a plugin sets it. `metadata strip` and API `mode: "exif"` return a documented PDF skip before ExifTool or any PDF writer is invoked. The PDF compression dependency set is `file` plus `qpdf`; PDF metadata-only work skips every detected PDF and needs neither ExifTool nor QPDF.

Validate every candidate with read-only QPDF checking. Any warning or invalid candidate is discarded. Preserve the existing threshold, dry-run, timestamp, output-directory, cancellation, and receipt contracts. Never replace an input with a larger result. Only a fully eligible candidate can reach the existing replacement code.

The reversible stream/object operations and optional lossy image operations are documented separately in [QPDF file-size optimization](https://qpdf.readthedocs.io/en/stable/cli.html#optimizing-file-size).

## Shared interfaces

The [PDF core](../../src/core/pdf.ts) owns typed inspection, classification, process policy, and candidate creation. Keep process arguments as arrays. Use bounded subprocess output and a timeout; these limits produce explicit inspection skips, not partial JSON acceptance. Initial inspection limits: 64 MiB captured JSON and 60 seconds per read-only subprocess, configurable internally for deterministic tests but not new public flags. Candidate processing uses a 120-second subprocess timeout. Treat spawn errors separately from a QPDF exit status.

The source definitions are authoritative: `PdfInspection`, `inspectPdf`,
`classifyPdfJson`, and `optimizePdfSnapshot` live in the PDF core;
[`PdfSkipReason`](../../src/types/optimization.ts) is exposed through the
[public API result](../API.md#result-shape). Executable resolution and the
run-scoped capability cache are internal implementation details.

The shared orchestration performs inspection before calling `optimizePdfSnapshot`; that function accepts only the inspected immutable workspace path. The optional `skipReason` field is present on `OptimizationResult` and `ApiOptimizationResult` and propagates through CLI JSON, events, receipts, and plugins without changing existing status values or schema versions. This distinguishes protected skips from ordinary insufficient-savings skips. Existing generic image skips remain valid without the field.

| Condition                                                                               | Result                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Encrypted, signature/signature field, `/Prev`, or XFA indication                        | `skipped`, with the corresponding PDF reason; no persistent output |
| Document parse/check warning, malformed JSON/schema, inspection timeout or output limit | `skipped`, `pdf-inspection-inconclusive`; no persistent output     |
| Missing/incompatible executable, spawn/permission error, or changed source              | `failed`; no persistent output                                     |
| A max candidate fails but another validates                                             | Continue with the valid candidate and existing size threshold      |
| All rewrite candidates fail creation or validation                                      | `failed`; no persistent output                                     |
| PDF metadata-only request                                                               | `skipped`, `pdf-metadata-unsupported`, using only format detection |

## Integration behavior

| Surface           | Required PDF behavior                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI and JS/TS API | Same eligibility guard for ordinary compression, dry-run, max, explicit outputs, plan apply, and receipt resume. Protected skips report zero savings, unchanged content, and `wroteOutput: false` for API-created destinations.                                |
| Gulp              | Support buffered Vinyl, Readable, and null/path-backed inputs. In-memory bytes take precedence over `file.path`; a skipped asset passes through with the same bytes and path.                                                                                  |
| Grunt             | Add `.pdf` recognition. An explicit normal source-to-destination mapping may copy protected bytes unchanged; in-place optimization must not rewrite them.                                                                                                      |
| Babel             | Add local PDF references. Optimize privately and publish a cache file/change the reference only after a successful accepted PDF result. Protected and inconclusive PDFs leave references and preexisting cache files alone.                                    |
| Rollup            | Optimize eligible assets in memory before output; retain existing hash/reference behavior for changed PDFs. Never decode/rewrite PDF bytes as text while updating another asset's references. Limit text reference rewriting to known text formats and chunks. |
| Parcel            | Configure a PDF optimizer glob and add the format filter. If a Readable is consumed for inspection, return the original normalized bytes on a skip, not the exhausted input stream. Preserve binary contents exactly.                                          |
| Vite              | Include PDFs in supported output discovery; cover both public copied files and emitted PDF assets, respecting the existing build-only lifecycle.                                                                                                               |
| Webpack           | Include PDFs in final emitted-file discovery; preserve references, output names, and protected bytes. Keep its documented lifecycle; do not claim a new hashing guarantee.                                                                                     |
| esbuild           | Include PDF file-loader output in the existing successful disk-write lifecycle; preserve metafile references and protected bytes.                                                                                                                              |
| Astro             | Delegate to the Vite integration; cover static public PDF output. Existing SSR/hybrid limitations remain explicit.                                                                                                                                             |
| Next.js           | Delegate to the Webpack integration and test supported webpack builds with PDF assets. Do not imply Turbopack support.                                                                                                                                         |

## Dependency refresh policy

Audit every direct runtime, development, and peer declaration and the complete resolved lockfile graph. Record declared range, resolved version, registry stable target, engines, peers, deprecations, release-note evidence, and recommendation. Record unresolved or held upgrades individually. Refresh transitive dependencies through supported parent upgrades; do not use blanket overrides to force incompatible majors.

Separate consumer Node compatibility from the development runtime. Keep `engines.node >=22.13.0` unless a distinct, deliberate compatibility change is approved. Development tools may require a newer Node version if CI/development uses that version and generated artifacts are tested on the consumer floor. Retain supported integration peer majors and lower bounds; widening support requires real-host tests. A latest upstream engine requirement alone is not a reason to hold a development-only tool, and it is not permission to narrow a public peer range.

Pin Bun explicitly and update all CI and documentation occurrences together. Regenerate only `bun.lock`, retaining the existing ban on committed npm/yarn lockfiles. Keep standalone Node on a reviewed supported LTS line, aligned across package metadata and release workflow. Upgrade SHA-pinned GitHub actions only after reviewing their runtime/runner changes.

Homebrew formulas normally select their current versions; Squeezit's catalog stores minimum supported versions, not a lock of Homebrew installations. Track approved tested native versions separately from compatibility floors. Raise a minimum only for a necessary capability or identified safety fix; do not make Debian's package mappings unusable merely to mirror Homebrew's latest patch. Where a provider cannot supply the required version, use an explicit supported manual/pinned fallback or report it as unavailable. Never claim an APT command satisfies a floor when its package does not.

Target QPDF 12.4.2 in the current macOS validation environment. The verified minimum QPDF 11.3.0 provides the JSON-v2 baseline. Both the minimum and 12.4.2 passed the recorded PDF checks. No Ghostscript or `compress-pdf` dependency is introduced.

Exact version findings and holds live in the [dependency audit](../maintenance/dependency-refresh/dependency-audit.md). Refresh volatile registry/formula evidence before changing the lockfile again.

## Acceptance and verification

- Encrypted PDFs, empty-password encrypted PDFs, valid/invalid/expired embedded signatures, invisible signatures, certification, timestamps, and blank signature fields are skipped byte-for-byte across every applicable surface.
- Missing or ambiguous PDF structures, QPDF warnings, failed inspection, and source changes never cause an overwrite.
- PDFs with a non-null parsed trailer `/Prev` are skipped, including unsigned linearized files; PDF content hidden by RAW/CUR/other misleading supported extensions still reaches PDF protection. PDF <1.5 inputs do not gain object streams.
- Compression preserves decoded content streams, embedded image bytes where encoded with JPEG/JPX, image dimensions, fonts, Info/XMP, links, bookmarks, forms, and attachments in a representative fixture set. Do not treat a successful `qpdf --check` as sufficient evidence of content preservation.
- All ten integrations have real-host PDF coverage, including a protected pass-through case, disabled behavior, and their relevant output lifecycle. Rollup's unrelated-asset rename cannot modify any PDF.
- Dependencies are supported by a reproducible fresh install, consumer-floor and modern-Node tests, real integration tests, package/export checks, and native tests on the documented platforms.
- Run `bun run verify:agent`, focused PDF tests, `bun run test:integration`, `bun run build`, `bun run check:exports`, and package inspection. Run the serial slow lane once during implementation because native encoder updates and the new PDF max path affect max-profile behavior. Do not run it merely to review these planning files.

## Historical planning baseline (2026-10-28)

Repository baseline: clean `main`, commit `af41b7a`, Squeezit 2.4.3. `bun run typecheck` passed, and `bun run test:fast` passed 176 tests across 24 files before planning-file edits. These results describe the pre-upgrade tree. The implementation record links the later validation and remaining gates.

`agent:preflight` reports Bun 1.3.14 against the repository pin 1.3.5; this is a setup prerequisite for implementation, not proof of an upgrade regression. It also reports missing approved MozJPEG and JPEG XL executables, and an older global Squeezit installation shadowing the repository. Use the repository's built entry point for verification. Resolve native-tool readiness before claiming native compression tests pass.

A builder review reproduced the historical-signature gap with synthetic well-formed table- and stream-based incremental updates under QPDF 12.4.2: current JSON omitted superseded signature dictionaries but retained trailer `/Prev`. An unsigned linearized sample also retained `/Prev`. These were diagnostic fixtures with signature markers, not proof of cryptographic validation. The conservative policy above reflects that evidence and must be exercised at the minimum supported QPDF version too.
