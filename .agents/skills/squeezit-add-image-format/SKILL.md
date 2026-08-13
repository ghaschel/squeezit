---
name: squeezit-add-image-format
description: Use when adding or changing a supported Squeezit image format, its detection, optimization pipeline, native optimizer binary, metadata policy, platform package mapping, or image test fixture.
---

# Squeezit Add Image Format

## Overview

A format is a vertical slice: detection, execution, native-tool readiness,
integration filters, fixtures, and documentation must agree. Treat the
dependency catalog as product behavior, not installation metadata.

## Decide compatibility before coding

Establish the file extension(s), reliable MIME values, lossless optimizer,
minimum supported binary version, macOS/Homebrew and Debian package providers,
metadata behavior, standard/max profile behavior, and dry-run expectations.

Reject a format whose native tool cannot be made available or meaningfully
verified on supported platforms. If `file --mime-type` can report a generic or
missing MIME value, define both a MIME mapping and an extension fallback.

## Implement the complete slice

1. Update `SupportedFormat` in `src/types/optimization.ts`, discovery's
   `SUPPORTED_EXTENSIONS`, and optimizer extension/MIME detection mappings.
2. Add an explicit optimizer pipeline branch and native command runner in
   `src/utils/optimizer.ts`. Preserve the result, threshold, dry-run, and
   error contracts used by existing formats.
3. Add each binary to `DependencyName` and `DEPENDENCY_CATALOG` in
   `src/core/dependencies.ts`: executable, package providers, minimum version,
   version arguments/reporting, and remediation. Connect format dependencies
   and decide metadata-tool inclusion intentionally.
4. Find and update every format filter outside core—Rollup, Babel, Gulp,
   Grunt, Parcel, integration globs, and documentation examples. Vite/Webpack/
   esbuild use core discovery; Astro/Next may delegate.
5. Add a real fixture under `tests/fixtures/formats/<format>` and its expected
   default, EXIF, and max values in the fixture manifest. Update supported
   format and native-tool documentation, including Homebrew-derived behavior.

## Verify

- Add `tests/integration/api-<format>.test.ts` using `defineApiFormatTests`.
  Assert core API behavior and, where applicable, dry-run and metadata modes.
- Add unit coverage for dependency selection, diagnostics, version gates, MIME
  and extension detection, and the missing-binary failure. Confirm the runner
  does not silently optimize the wrong format.
- Exercise every adapter with its own explicit format filter; add or extend the
  appropriate real integration tests.
- Run focused format/core/dependency tests, affected integration tests,
  `bun run typecheck`, and `bun run test:unit`. Run the long max-compression
  fixture only when specifically required for format-quality release coverage.

## Common mistakes

- Do not add only the extension: `file` MIME detection can bypass it.
- Do not leave a native binary out of `DEPENDENCY_CATALOG`; `doctor`,
  `deps install`, Homebrew, and integrations derive behavior from it.
- Do not assume metadata stripping is correct for every format; model the
  existing special cases deliberately.
- Do not reuse fixture savings from a different machine or binary version.
