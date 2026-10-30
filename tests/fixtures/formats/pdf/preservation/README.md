# Original PDF preservation fixtures

All image samples and font outlines in this directory were created for Squeezit
by `tests/helpers/generate-pdf-preservation.py`. No installed, downloaded, or
third-party font/image artwork is copied. These original test assets use the
repository's MIT license.

- `original.jp2`: an 8×8 RGB checker/gradient, encoded losslessly with OpenJPEG
  `opj_compress` 2.5.4, three resolution levels. Its samples are integer formulas
  in the generator.
- `original.ttf`: a 1,000-unit TrueType font containing `.notdef`, space, and two
  deliberately geometric glyphs mapped to A/B. FontTools 4.60.1 constructs the
  font from original point lists; deterministic creation/modification timestamps
  avoid regeneration drift. Embedding is unrestricted (`fsType=0`).
- `jpx-embedded-font.pdf`: a PDF 1.5 page with the original JP2 payload under
  `/JPXDecode`, a compressed `/FontFile2` containing the full original TrueType
  program, and compressible page content displaying the image and `ABBA`.
- `checksums.json`: SHA-256 identities of these three generated binary assets.

To regenerate, install FontTools 4.60.1 in an isolated Python environment and
make OpenJPEG 2.5.4's `opj_compress` available, then run:

```sh
python tests/helpers/generate-pdf-preservation.py
```

These are **generation-only** dependencies. Tests consume the checked-in assets
and need only the existing QPDF and Poppler tools; Squeezit's production
dependency list is unchanged. FontBuilder's API is documented in the
[upstream source](https://github.com/fonttools/fonttools/blob/main/Lib/fontTools/fontBuilder.py).

`tests/integration/api-pdf-preservation.test.ts` first verifies the fixture
identities, then requires standard and max compression to preserve the raw
compressed JPX bytes, decoded TrueType program bytes, image dimensions/color
properties, font descriptor, and before/after Poppler PNG render hashes. It
uses an isolated Fontconfig configuration rather than relying on an installed
Helvetica substitute. It also covers PDF mtime preservation and original-byte
output copies when compression cannot meet the requested threshold.

The generated page was visually inspected: a colored checker/gradient above
four black geometric glyphs, with no clipping. Render equality is evaluated
within the same Poppler run/environment, not against a cross-platform golden
PNG. Valid structure or matching compressed size alone is never treated as
proof of content preservation.
