/** Small valid PDFs built without a PDF writer, so preservation expectations
 * do not depend on the optimizer under test. Objects 1–6 are reserved. */
export function createPdf(
  options: {
    version?: string;
    catalog?: string;
    objects?: string[];
    content?: string;
    page?: string;
    resources?: string;
  } = {}
): Buffer {
  const content =
    options.content ??
    `BT /F1 12 Tf 20 100 Td (Preserve this text) Tj ET\n${"% compressible padding\n".repeat(1500)}`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${options.catalog ?? ""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> ${options.resources ?? ""} >> /Contents 4 0 R ${options.page ?? ""} >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Title (Preserved title) /Author (Squeezit fixture) >>",
    ...(options.objects ?? []),
  ];
  let pdf = `%PDF-${options.version ?? "1.4"}\n`;
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export function signatureFieldPdf(): Buffer {
  return createPdf({
    catalog: "/AcroForm << /Fields [7 0 R] >>",
    objects: ["<< /FT /Sig /T (Signature) >>"],
  });
}

/** An unsigned update can hide the previous signed catalog from current JSON. */
export function appendUnsignedRevision(bytes: Buffer, stream = false): Buffer {
  const previous = Number(
    bytes.toString().match(/startxref\n(\d+)\n%%EOF/)?.[1]
  );
  const catalog = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const offset = bytes.length;
  const xref = offset + Buffer.byteLength(catalog);
  if (stream) {
    const entry = (position: number) => {
      const b = Buffer.alloc(7);
      b[0] = 1;
      b.writeUInt32BE(position, 1);
      return b;
    };
    const entries = Buffer.concat([entry(offset), entry(xref)]);
    return Buffer.concat([
      bytes,
      Buffer.from(catalog),
      Buffer.from(
        `8 0 obj\n<< /Type /XRef /Size 9 /Root 1 0 R /Info 6 0 R /Prev ${previous} /W [1 4 2] /Index [1 1 8 1] /Length ${entries.length} >>\nstream\n`
      ),
      entries,
      Buffer.from(`\nendstream\nendobj\nstartxref\n${xref}\n%%EOF\n`),
    ]);
  }
  return Buffer.concat([
    bytes,
    Buffer.from(
      `${catalog}xref\n1 1\n${String(offset).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 8 /Root 1 0 R /Info 6 0 R /Prev ${previous} >>\nstartxref\n${xref}\n%%EOF\n`
    ),
  ]);
}
