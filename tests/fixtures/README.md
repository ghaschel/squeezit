# Test Fixtures

Add one unoptimized sample file to each folder under `tests/fixtures/formats`.

The integration tests copy these fixtures into a temporary workspace before running the API so the source fixtures are never mutated.

After adding the files, run:

```bash
bun run fixture-values -- --mode default tests/fixtures/formats/png/sample.png
```

Use the reported values to replace the placeholder expectations in `tests/helpers/fixture-manifest.ts`.

## PDF fixtures

PDF fixtures are project-generated rather than borrowed documents. The small
`formats/pdf/document.pdf` and `signature-field.pdf` inputs were generated from
the original version of `tests/helpers/pdf.ts` (`createPdf()` and
`signatureFieldPdf()` respectively). The current helper adds optional resource
and page fields, so regenerating these baseline assets can change whitespace,
cross-reference offsets, and exact sizes. The helper also constructs
incremental-revision policy cases in temporary test workspaces. The plain
signature-field fixture is structural, not a valid cryptographic signature.

- [Signature fixture provenance](formats/pdf/signatures/README.md) distinguishes
  valid, invalid, expired and certification CMS fixtures from the synthetic
  timestamp marker. Its [checksums](formats/pdf/signatures/checksums.json) record
  generated artifacts and the OpenSSL version; no private keys are committed.
- [Preservation fixture provenance](formats/pdf/preservation/README.md) documents
  original JPX image samples and an embedded TrueType font, their reproducible
  generator, and [checksums](formats/pdf/preservation/checksums.json).

PDF preservation tests compare embedded payloads and decoded/rendered content,
not just size or QPDF structural validity. Protected fixtures must remain
byte-identical, including preexisting output destinations. Generation tools
are test-authoring dependencies only; the checked-in fixtures allow CI to run
without installing font or image generators.
