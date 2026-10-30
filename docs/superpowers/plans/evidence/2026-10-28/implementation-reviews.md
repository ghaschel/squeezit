# Independent implementation reviews

These are historical review checkpoints and scoped resolutions. The final
implementation report and final verification evidence supersede intermediate
counts or pending-check statements.


---

# PDF safety and integration review

Verdict: changes requested. The core safety architecture and adapter fixes match the design, but the PDF publication baseline and defensive JSON validation still need corrections. No implementation edits or commits were made; this review used the supplied core diff plus current PDF module, PDF tests, shared asset/API code, and affected adapter code/tests. Existing green suites were not rerun.

## Actionable findings

1. **[P1] Bind size/timestamps to the fingerprinted source, not an earlier stat.** `src/utils/optimizer.ts:393–400`, then `414–417`. The source stat is captured before the input guard and SHA-256 baseline. If the file changes in that interval, both the snapshot and final digest match the newer file, but the replacement threshold uses the older size. This is outside the acknowledged final-check-to-rename race and violates the no-larger-replacement requirement. Deterministically reproduced with the real QPDF: start with `createPdf()` (35,207 bytes), replace it with `createPdf({content: ""})` (651 bytes) in the first input-guard invocation, and optimize at threshold zero. The result is `optimized`, reports 34,475 bytes saved, and replaces the 651-byte current PDF with a 732-byte file. Capture/validate source metadata and fingerprint as one consistent baseline, or derive size from the digest-verified snapshot and detect metadata changes across baseline acquisition. Add this acquisition-window regression in addition to the existing final-publication mutation tests.

2. **[P2] Reject incomplete page/object JSON before declaring eligibility.** `src/core/pdf.ts:43–58,75–81`. The classifier checks only a small subset of the required schema: it accepts an empty page summary even when the catalog's `/Pages` points to an object absent from the object dictionary, and does not require such QPDF header completeness fields as `maxobjectid`/`calledgetallpages` or AcroForm summary structure. A direct reproducible input `{version:2,encrypt:{encrypted:false},acroform:{fields:[]},pages:[],qpdf:[{jsonversion:2,pdfversion:"1.4"},{"obj:1 0 R":{value:{"/Type":"/Catalog","/Pages":"999 0 R"}},trailer:{value:{"/Root":"1 0 R"}}}]}` returns `eligible:true,pageCount:0`. It should return inconclusive. This is a defensive-contract defect, not demonstrated bypass of genuine QPDF output: the preceding native check remains a separate barrier. Validate mandatory JSON-v2 structure, page-tree/summary consistency and referenced dictionaries needed to establish complete inspection; add missing-object and missing-summary regressions.

3. **[P2] Probe JSON capability separately from document classification.** `src/core/pdf.ts:144–159`. The mandatory probe verifies only version text, then maps every nonzero `--json=2` result to a document inspection skip. A version-reporting executable lacking the required JSON capability therefore reports each document as protected/inconclusive instead of the design's incompatible-executable failure. Add a capability probe independent of the user's document, resolve and pin the executable, and cache the successful version/capability probe within the run keyed by that executable. The current implementation also runs `--version` for every PDF and re-resolves `qpdf` from PATH on every child spawn; the explicitly planned successful-probe cache is absent.

## What checked out

- Metadata-only PDF recognition precedes image metadata writers; PDF headers precede RAW/CUR shortcuts and staged image paths reject PDF bytes.
- Encryption, current signature indicators, blank fields, XFA and non-null trailer `/Prev` conservatively skip; dictionaries are traversed without raw PDF substring signature heuristics.
- Inspection is bounded, spawn failures remain failures, rewrite flags avoid lossy/metadata operations, ambient `QPDF_ZOPFLI` is removed, and max independently evaluates levels 6 and 9 with validation/fallback.
- Publication uses a digest-checked snapshot and rechecks live source for accepted replacements and insufficient-savings destination copies. Protected skips omit target publication and leave existing destinations untouched.
- Gulp now prefers buffered/streamed bytes over the disk path and returns normalized bytes; Parcel returns normalized bytes after consuming a skipped stream; Babel stages privately before deciding whether to create cache/reference output; Rollup limits reference rewriting to text extensions. No additional adapter defect was established.

## Verification and remaining assumptions

Ran two focused, temporary `bun -e` reproductions: the real-QPDF stale-baseline growth example and direct malformed-JSON classifier example above. Both reproduced. Temporary inputs were cleaned up. Did not rerun supplied green suites or a compatibility matrix.

The supplied tests cover synthetic signature indicators and blank fields, encryption with empty/nonempty passwords, revision-history rejection, content/metadata/resource preservation, and adapter pass-through. They do not establish the full stated authentic valid/invalid/expired signed-document matrix. This review did not independently verify QPDF 11.3.0 behavior, all supported host peer majors, embedded font/JPX preservation, or native-platform packaging. Keep those acceptance claims tied to actual stage validation evidence.


---

# Final whole-change review

Reviewed the approved PDF/dependency specification, final diff, current PDF core and orchestration, changed adapters, package/runtime declarations, native catalog and receipts, release/compatibility workflows, and worker verification reports. No source edits or long test reruns were performed.

## Actionable finding

### P2 — Dry-run insufficient-savings PDFs falsely report an output write

Location: `src/utils/optimizer.ts:474-477` (new PDF threshold return); downstream inference in `src/api/index.ts:188-190`.

When an eligible PDF is requested with `dryRun: true`, a distinct `outputDir`, and a threshold greater than its savings, the PDF branch correctly avoids `writeSkippedOutput`, but returns `status: "skipped"` with the distinct `targetPath`. `toApiResult` infers `wroteOutput: true` from that status/path combination. Consumers are told that an output was written although no destination exists. This violates the PDF dry-run/public-result contract. The older image threshold branch has an analogous issue; this change introduces the behavior for PDFs as well.

Reproduced against the current built API after repository capabilities/doctor preflight:

```js
await optimizeFile("tests/fixtures/formats/pdf/document.pdf", {
  dryRun: true,
  threshold: 1000000,
  outputDir: "/tmp/sqz-final-review-never-written",
  checkDependencies: false,
});
```

Result: `status: "skipped"`, `originalSize: 35205`, `optimizedSize: 934`, `changed: false`, **`wroteOutput: true`**. A filesystem check confirms that the destination directory does not exist. Carry actual write/dry-run context into API result conversion (while retaining the planned output path), and cover dry-run insufficient-savings with a distinct output destination.

## Other review conclusions and limits

- The three prior core findings are addressed in the current implementation: snapshot size agrees with the baseline; JSON requires coherent catalog/page-tree/object structure; executable version/JSON capability probes are distinct from document skips and scoped to the resolved executable/run.
- Protection checks precede PDF rewriting and metadata-only work bypasses PDF writers. Structured signature/encryption/revision/XFA checks and bounded subprocess handling fail conservatively. Publication uses the inspected snapshot and source fingerprints, with the documented optimistic race boundary.
- Gulp content precedence, Parcel consumed-stream handling, Babel private staging/protected cache behavior, Rollup binary preservation, and Astro final-output lifecycle changes are consistent with the approved adapter requirements.
- Runtime/dependency floors and pins are separated from current tested targets; source receipts and explicit manual Debian fallbacks avoid pretending stale APT packages meet existing floors. No additional demonstrated runtime/install/security defect found.
- APNG animation and AVIF decoder/EXIF changes have targeted preservation evidence in the native report; size expectations were not accepted merely because output was smaller.
- This review does not convert local macOS evidence into Linux/Intel runtime proof. The added CI matrix remains an execution gate, not a code defect solely because it has not run here. The compatibility workflow currently selects the core PDF/process/API suites; the separate authentic-signature suite is covered by the full integration lane rather than that matrix selection.
- Parent owns final integration/aggregate results. The initial complete slow run failed exact-size assertions; targeted corrected cases and retained JXL output evidence must be described accurately rather than called a fresh all-green full slow run.

Disposition: fix the P2 reporting defect before final acceptance; no other blocking finding identified in this review.

## Scoped fix review — resolved

Reviewed `final-fix.diff`, current `src/api/index.ts`, and the regression at `tests/integration/api-pdf.test.ts:305`. Both `optimizeFile` and `optimizeFiles` now pass the normalized `dryRun` flag into result conversion. `wroteOutput` requires `!dryRun`, while the planned output path and skipped status remain intact. This directly resolves the reproduced P2 for single-file and batch calls, including metadata wrappers delegating to those APIs.

The regression exercises the exact failing combination: eligible PDF, excessive savings threshold, dry run, distinct output directory, `wroteOutput: false`, and absent destination. Parent reports the test was observed failing before the repair and all 63 focused PDF tests passing afterward. No additional tests were rerun in this scoped review. No new finding in the fix; final review disposition is approved subject to the parent's remaining aggregate verification gates.

## Scoped source-change outcome review — approved

Reviewed the final `optimizePdfInput` change and the four added subprocess regressions. Checking the source fingerprint before returning protected/inconclusive inspection skips and before every threshold return closes the contract gap where a changed source could previously be reported as a successful skip. Moving the threshold check outward preserves its position before any output copy and does not weaken the existing publication guard. Ordinary and dry-run insufficient-savings paths now receive the same changed-source failure classification. Errors propagate through the existing failure-result handling, and workspace cleanup still runs in `finally`.

The tests use a PATH-local QPDF wrapper only to mutate the live original when inspection begins; genuine QPDF continues processing the already-created private snapshot. This deterministically reaches protected, malformed/inconclusive, below-threshold, and dry-run below-threshold outcomes, then asserts failure, no write claim, and preservation of the concurrently changed source. Parent observed all four fail as `skipped` before the fix. This is a meaningful regression at the source/snapshot boundary, not merely an assertion on a mocked process response.

No new finding. Metadata-only skips still intentionally return immediately without QPDF inspection or snapshot creation; this change does not expand that documented detection-only path. The documented optimistic race boundary after the final fingerprint remains unchanged. No long suite was rerun for this scoped review; parent owns the final 72-test current/floor results and aggregate checks. Parent also reports the concurrent packaging type errors noted in the supplemental preservation report were repaired and typecheck passed.
