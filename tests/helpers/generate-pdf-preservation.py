"""Generate original PDF preservation assets (generation only, not a test dependency).

Requires fonttools==4.60.1 and OpenJPEG opj_compress 2.5.4. No third-party
font or image is copied: glyph outlines and every RGB sample originate here.
Run from any directory; output is tests/fixtures/formats/pdf/preservation/.
"""

import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zlib

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

output = Path(__file__).resolve().parents[1] / "fixtures/formats/pdf/preservation"
output.mkdir(parents=True, exist_ok=True)

# Deliberately geometric test glyphs, not outlines copied from an installed font.
outlines = {
    ".notdef": [(50, 0), (50, 700), (550, 700), (550, 0)],
    "A": [(50, 0), (300, 700), (550, 0), (400, 0), (300, 350), (200, 0)],
    "B": [(50, 0), (50, 700), (550, 700), (550, 500), (250, 500),
          (250, 400), (500, 400), (500, 200), (250, 200), (250, 0)],
    "space": [],
}
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(list(outlines))
font.setupCharacterMap({32: "space", 65: "A", 66: "B"})
glyphs = {}
for name, points in outlines.items():
    pen = TTGlyphPen(None)
    if points:
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    glyphs[name] = pen.glyph()
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (600, 50 if points else 0)
                             for name, points in outlines.items()})
font.setupHorizontalHeader(ascent=800, descent=-200)
font.setupNameTable({"familyName": "SqueezitFixture", "styleName": "Regular",
                    "uniqueFontIdentifier": "SqueezitFixture-1",
                    "fullName": "SqueezitFixture Regular",
                    "psName": "SqueezitFixture-Regular", "version": "Version 1.0"})
font.setupOS2(sTypoAscender=800, sTypoDescender=-200,
             usWinAscent=800, usWinDescent=200, fsType=0)
font.setupPost()
font.font.recalcTimestamp = False
font.font["head"].created = 3406620153
font.font["head"].modified = 3406620153
font.save(output / "original.ttf")

with tempfile.TemporaryDirectory(prefix="squeezit-jpx-source-") as temporary:
    ppm = Path(temporary) / "original.ppm"
    # Eight by eight checker/gradient: all samples are exact integers.
    pixels = bytes(component for y in range(8) for x in range(8)
                   for component in (x * 32, y * 32, 255 if (x + y) % 2 else 0))
    ppm.write_bytes(b"P6\n8 8\n255\n" + pixels)
    subprocess.run(["opj_compress", "-i", str(ppm), "-o",
                    str(output / "original.jp2"), "-n", "3"], check=True)


def stream(dictionary, data):
    return (f"<< {dictionary} /Length {len(data)} >>\nstream\n".encode()
            + data + b"\nendstream")


ttf = (output / "original.ttf").read_bytes()
jpx = (output / "original.jp2").read_bytes()
content = (b"q 100 0 0 100 50 70 cm /Im1 Do Q\n"
           b"BT /F1 30 Tf 40 30 Td (ABBA) Tj ET\n"
           + b"% original compressible padding\n" * 300)
objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
    b"/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 8 0 R >> >> "
    b"/Contents 4 0 R >>",
    stream("", content),
    b"<< /Type /Font /Subtype /TrueType /BaseFont /SqueezitFixture-Regular "
    b"/FirstChar 65 /LastChar 66 /Widths [600 600] /Encoding /WinAnsiEncoding "
    b"/FontDescriptor 6 0 R >>",
    b"<< /Type /FontDescriptor /FontName /SqueezitFixture-Regular /Flags 32 "
    b"/FontBBox [0 -200 600 800] /ItalicAngle 0 /Ascent 800 /Descent -200 "
    b"/CapHeight 700 /StemV 80 /FontFile2 7 0 R >>",
    stream(f"/Filter /FlateDecode /Length1 {len(ttf)}", zlib.compress(ttf)),
    stream("/Type /XObject /Subtype /Image /Width 8 /Height 8 "
           "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode", jpx),
]
pdf = bytearray(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
offsets = []
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
xref = len(pdf)
pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
pdf += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
pdf += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n").encode()
(output / "jpx-embedded-font.pdf").write_bytes(pdf)
checksums = {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
             for name in ["original.ttf", "original.jp2", "jpx-embedded-font.pdf"]}
(output / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n")
print(json.dumps(checksums, indent=2))
