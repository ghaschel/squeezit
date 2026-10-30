# PDF optimization

Squeezit uses QPDF to compress well-formed PDFs while preserving document
content and metadata. It changes the PDF's internal representation, so lossless
does not mean byte-identical. Savings depend on how the input was produced and
can be zero, especially when images already use efficient compression.

See the [API reference](API.md) for options and the
[automation contract](agent-contract.md#pdf-results) for JSON results.

## Quick start

QPDF 11.3.0 or newer is required for compression. The implementation was tested
with 11.3.0 and 12.4.2. Check the tools selected for a PDF before optimizing:

```bash
sqz deps doctor document.pdf
sqz compress document.pdf --dry-run
sqz compress document.pdf
```

On macOS, QPDF is available through `brew install qpdf`. Use `sqz deps install
document.pdf` for the supported provider on your platform; `sqz deps doctor`
reports an unavailable or outdated tool and its remediation.

Preview the stronger profile:

```bash
sqz compress document.pdf --profile max --dry-run
```

Use the public API to keep the source and write to a separate directory:

```ts
import { optimizeFile } from "squeezit";

const result = await optimizeFile("document.pdf", {
  mode: "default",
  outputDir: "optimized",
});

if (result.status === "skipped") {
  console.log(result.skipReason ?? result.message);
}
```

## What compression preserves

Standard compression recompresses Flate streams at level 6. Max independently
tries levels 6 and 9 from the same original snapshot, validates each candidate,
and selects the smallest valid result. One failed candidate does not discard
another valid candidate. Existing minimum-savings rules still apply; max uses a
zero threshold and never replaces a source with a larger output.

QPDF does not downsample or lossily re-encode images. Text, fonts, JPEG/JPX
payloads, forms, links, bookmarks, attachments, and Info/XMP metadata remain.
PDFs below version 1.5 retain their object-stream behavior; newer documents may
use generated object streams. This does not certify PDF/A or print-standard
conformance. Ambient `QPDF_ZOPFLI` settings do not change the pipeline.

PDF metadata is preserved even when `--strip-meta`, `stripMetadata: true`, or
an integration enables image metadata stripping. `sqz metadata strip`, the
`stripMetadata()` API, and `mode: "exif"` skip PDFs without invoking ExifTool
or requiring QPDF.

## Protected and inconclusive documents

Inspection runs against the exact private snapshot used for compression.
Squeezit skips all encryption, including empty-password and permissions-only
documents. It also skips filled, blank, or inherited signature fields,
signature dictionaries, document timestamps, certification permissions, and
XFA documents.

A parsed trailer `/Prev` means earlier revisions may contain signatures that
are absent from the current object view. Such documents are skipped, including
some unsigned incremental and linearized PDFs. This is not a claim that every
skipped document is signed. Malformed structures, parse warnings, ambiguous
inspection, timeouts, and oversized inspection results also skip conservatively.

| `skipReason`                  | Meaning                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `pdf-encrypted`               | Encryption or permissions protection is present                             |
| `pdf-signature`               | A signature, timestamp, or certification indication is present              |
| `pdf-signature-field`         | A signature field or signing flag is present, including a blank field       |
| `pdf-inspection-inconclusive` | Clean, complete inspection could not be established                         |
| `pdf-unsupported-structure`   | Revision history or an unsupported signing structure such as XFA is present |
| `pdf-metadata-unsupported`    | A PDF metadata-only operation was requested                                 |

These skips report zero savings, `changed: false`, and `wroteOutput: false`.
The source and any existing destination are untouched. An ordinary
insufficient-savings skip has no PDF protection reason; with an output directory,
it may copy the inspected original bytes according to the existing API contract.
Dry runs never publish a copy.

There is no password, signature-removal, or force-bypass option. Inspection does
not verify signature authenticity or detect detached signatures stored outside
the PDF. A graphic of handwriting is ordinary page content.

## Failures and troubleshooting

- Missing or incompatible QPDF, process-launch errors, and changed source files
  are failures. `checkDependencies: false` never disables inspection or QPDF's
  version/capability checks.
- The source hash is checked before publication and before returning an
  inspected skip. This detects concurrent changes but is not an atomic lock
  against a separate writer after the last check.
- Inspection allows 60 seconds per process and 64 MiB of JSON. A rewrite allows
  120 seconds. These are internal limits, not user bypass flags.
- A protected or inconclusive skip needs no retry with more aggressive settings.
  Keep the original; Squeezit deliberately does not repair or remove protection.
- A successful rewrite may save little. Max compares lossless compression
  candidates; it cannot guarantee a requested file size.

Reviewable plans identify candidate files, not guaranteed PDF eligibility.
Applying a plan inspects each PDF again. Resume retains completed skips and
reinspects pending or failed work.

## Build integrations

All ten existing integrations support PDF assets through their normal exports.
See the [API integration examples](API.md#bundler-plugins) for configuration.

- Gulp prioritizes supplied buffers/streams over `file.path`; use
  `encoding: false` with Gulp 5. Parcel preserves consumed stream bytes on skips.
- Babel publishes a cache file and rewrites a reference only after an accepted
  PDF optimization. Grunt may perform its ordinary byte-for-byte destination
  copy even when PDF optimization skips.
- Rollup's in-memory path updates asset names and text references together;
  reference rewriting never treats PDF contents as text.
- Vite, Webpack, and esbuild retain their existing post-write filename/hash
  limitations. They do not recompute final-byte hashes or SRI.
- Astro supports static output. Next.js uses the Webpack integration; Turbopack
  is outside this implementation.
