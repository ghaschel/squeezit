import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import {
  appendUnsignedRevision,
  createPdf,
  signatureFieldPdf,
} from "../helpers/pdf";

function decodedContent(path: string): Buffer {
  const json = JSON.parse(execFileSync("qpdf", ["--json", path]).toString());
  const id = json.pages[0].contents[0].split(" ")[0];
  return execFileSync("qpdf", [
    `--show-object=${id}`,
    "--decode-level=generalized",
    "--filtered-stream-data",
    path,
  ]);
}
const directories: string[] = [];
async function fixture(bytes: Buffer, name = "input.pdf") {
  const directory = await mkdtemp(join(tmpdir(), "sqz-pdf-test-"));
  directories.push(directory);
  const path = join(directory, name);
  await writeFile(path, bytes);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("lossless PDF API", () => {
  test("compresses content reversibly while retaining document metadata and PDF 1.4", async () => {
    const path = await fixture(createPdf());
    const before = decodedContent(path);
    const result = await optimizeFile(path, {
      checkDependencies: false,
      stripMetadata: true,
    });
    expect(result.status).toBe("optimized");
    expect(result.savedBytes).toBeGreaterThan(1000);
    expect(decodedContent(path)).toEqual(before);
    const output = await readFile(path);
    expect(output.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(execFileSync("qpdf", ["--json", path]).toString()).toContain(
      "Preserved title"
    );
  });

  test.each(["pdf", "cr2", "cur", "jpg"])(
    "skips signature fields in .%s without modifying input or destination",
    async (extension) => {
      const bytes = signatureFieldPdf();
      const path = await fixture(bytes, `input.${extension}`);
      const outputDir = join(path, "..", "out");
      const result = await optimizeFile(path, {
        checkDependencies: false,
        outputDir,
      });
      expect(result.status).toBe("skipped");
      expect(result.skipReason).toBe("pdf-signature-field");
      expect(result.wroteOutput).toBe(false);
      expect(await readFile(path)).toEqual(bytes);
      await expect(
        readFile(join(outputDir, `input.${extension}`))
      ).rejects.toThrow();
    }
  );

  test("skips metadata-only requests before a writer runs", async () => {
    const bytes = createPdf();
    const path = await fixture(bytes);
    const result = await optimizeFile(path, {
      mode: "exif",
      checkDependencies: false,
    });
    expect(result.skipReason).toBe("pdf-metadata-unsupported");
    expect(result.wroteOutput).toBe(false);
    expect(await readFile(path)).toEqual(bytes);
  });

  test.each(["secret", ""])(
    "skips encryption with user password %j",
    async (password) => {
      const path = await fixture(createPdf());
      const encrypted = `${path}.encrypted.pdf`;
      execFileSync("qpdf", [
        "--encrypt",
        password,
        "owner",
        "256",
        "--",
        path,
        encrypted,
      ]);
      const bytes = await readFile(encrypted);
      const result = await optimizeFile(encrypted, {
        checkDependencies: false,
      });
      expect(result.skipReason).toBe("pdf-encrypted");
      expect(await readFile(encrypted)).toEqual(bytes);
    }
  );

  test("skips damaged PDFs instead of repairing them", async () => {
    const bytes = Buffer.from("%PDF-1.7\nmalformed");
    const path = await fixture(bytes);
    const result = await optimizeFile(path, { checkDependencies: false });
    expect(result.skipReason).toBe("pdf-inspection-inconclusive");
    expect(await readFile(path)).toEqual(bytes);
  });
});

describe("PDF revisions and publication", () => {
  test.each([false, true])(
    "skips signatures hidden by an incremental revision (xref stream %s)",
    async (stream) => {
      const bytes = appendUnsignedRevision(signatureFieldPdf(), stream);
      const path = await fixture(bytes);
      execFileSync("qpdf", ["--suppress-recovery", "--check", path]);
      const result = await optimizeFile(path, { checkDependencies: false });
      expect(result.skipReason).toBe("pdf-unsupported-structure");
      expect(await readFile(path)).toEqual(bytes);
    }
  );
  test("skips unsigned linearized documents that expose prior cross references", async () => {
    const path = await fixture(createPdf());
    const linearized = `${path}.linear.pdf`;
    execFileSync("qpdf", ["--linearize", path, linearized]);
    const before = await readFile(linearized);
    expect(
      (await optimizeFile(linearized, { checkDependencies: false })).skipReason
    ).toBe("pdf-unsupported-structure");
    expect(await readFile(linearized)).toEqual(before);
  });
  test("dry run measures savings without publishing and max is no larger than standard", async () => {
    const bytes = createPdf({ version: "1.7" });
    const path = await fixture(bytes);
    const dry = await optimizeFile(path, {
      dryRun: true,
      checkDependencies: false,
    });
    expect(dry.status).toBe("dry-run");
    expect(dry.wroteOutput).toBe(false);
    expect(await readFile(path)).toEqual(bytes);
    const max = await optimizeFile(path, {
      mode: "max",
      checkDependencies: false,
    });
    expect(max.status).toBe("optimized");
    expect(max.optimizedSize).toBeLessThanOrEqual(dry.optimizedSize);
  });
  test("keeps existing destinations intact on protection skips", async () => {
    const path = await fixture(signatureFieldPdf());
    const out = await mkdtemp(join(tmpdir(), "sqz-pdf-out-"));
    directories.push(out);
    const destination = join(out, "input.pdf");
    await writeFile(destination, "previous destination");
    const result = await optimizeFile(path, {
      outputDir: out,
      checkDependencies: false,
    });
    expect(result.wroteOutput).toBe(false);
    expect(await readFile(destination, "utf8")).toBe("previous destination");
  });
});

test("preserves XMP, JPEG bytes, form values, links, bookmarks, attachments and rendered pixels", async () => {
  const jpeg = await readFile(
    join(process.cwd(), "tests/fixtures/formats/jpeg/sample.jpg")
  );
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><test>Preserved XMP</test></x:xmpmeta>';
  const attachment = "unchanged attached bytes";
  const stream = (data: string, dict = "") =>
    `<< /Length ${Buffer.byteLength(data)} ${dict} >>\nstream\n${data}\nendstream`;
  const bytes = createPdf({
    version: "1.7",
    catalog:
      "/Metadata 7 0 R /Names << /EmbeddedFiles << /Names [(notes.txt) 9 0 R] >> >> /AcroForm << /Fields [11 0 R] >> /Outlines 13 0 R",
    page: "/Annots [12 0 R]",
    resources: "/XObject << /Picture 8 0 R >>",
    objects: [
      stream(xmp, "/Type /Metadata /Subtype /XML"),
      stream(
        `${jpeg.toString("hex")}>`,
        "/Type /XObject /Subtype /Image /Width 400 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode]"
      ),
      "<< /Type /Filespec /F (notes.txt) /EF << /F 10 0 R >> >>",
      stream(attachment, "/Type /EmbeddedFile"),
      "<< /FT /Tx /T (Name) /V (Preserved form value) >>",
      "<< /Type /Annot /Subtype /Link /Rect [0 0 20 20] /A << /S /URI /URI (https://example.com/preserved) >> >>",
      "<< /Type /Outlines /First 14 0 R /Last 14 0 R /Count 1 >>",
      "<< /Title (Preserved bookmark) /Parent 13 0 R /Dest [3 0 R /Fit] >>",
    ],
  });
  const path = await fixture(bytes);
  const beforeContent = decodedContent(path);
  const fontConfig = `${path}.fonts.conf`;
  await writeFile(
    fontConfig,
    `<fontconfig><dir>/System/Library/Fonts</dir><dir>/Library/Fonts</dir><dir>/usr/share/fonts</dir><cachedir>${join(path, "..")}</cachedir></fontconfig>`
  );
  const renderOptions = {
    env: { ...process.env, FONTCONFIG_FILE: fontConfig },
    timeout: 30000,
  };
  execFileSync(
    "pdftoppm",
    ["-singlefile", "-scale-to", "300", "-png", path, `${path}.before`],
    renderOptions
  );
  const result = await optimizeFile(path, {
    mode: "max",
    checkDependencies: false,
  });
  expect(result.status).toBe("optimized");
  expect(decodedContent(path)).toEqual(beforeContent);
  const json = JSON.parse(
    execFileSync("qpdf", ["--json", "--json-stream-data=none", path], {
      maxBuffer: 64 * 1024 * 1024,
    }).toString()
  );
  const text = JSON.stringify(json);
  for (const preserved of [
    "Preserved title",
    "Preserved form value",
    "Preserved bookmark",
    "https://example.com/preserved",
    "notes.txt",
  ])
    expect(text).toContain(preserved);
  const streamTypes: string[] = [];
  for (const [key, object] of Object.entries(json.qpdf[1]) as [
    string,
    { stream?: { dict: Record<string, unknown> } },
  ][]) {
    const type = object.stream?.dict["/Type"];
    if (!["/Metadata", "/XObject", "/EmbeddedFile"].includes(String(type)))
      continue;
    streamTypes.push(String(type));
    const id = key.slice(4).split(" ")[0];
    const data = execFileSync(
      "qpdf",
      [
        `--show-object=${id}`,
        "--decode-level=generalized",
        "--filtered-stream-data",
        path,
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    if (type === "/Metadata") expect(data.toString()).toBe(xmp);
    if (type === "/XObject") {
      expect(object.stream?.dict["/Filter"]).toEqual([
        "/ASCIIHexDecode",
        "/DCTDecode",
      ]);
      const encoded = execFileSync(
        "qpdf",
        [`--show-object=${id}`, "--raw-stream-data", path],
        { maxBuffer: 64 * 1024 * 1024 }
      );
      const jpegBytes = Buffer.from(
        encoded.toString().replace(/>\s*$/, ""),
        "hex"
      );
      expect(createHash("sha256").update(jpegBytes).digest("hex")).toBe(
        createHash("sha256").update(jpeg).digest("hex")
      );
    }
    if (type === "/EmbeddedFile") expect(data.toString()).toBe(attachment);
  }
  expect(streamTypes.sort()).toEqual([
    "/EmbeddedFile",
    "/Metadata",
    "/XObject",
  ]);
  execFileSync(
    "pdftoppm",
    ["-singlefile", "-scale-to", "300", "-png", path, `${path}.after`],
    renderOptions
  );
  expect(
    createHash("sha256")
      .update(await readFile(`${path}.after.png`))
      .digest("hex")
  ).toBe(
    createHash("sha256")
      .update(await readFile(`${path}.before.png`))
      .digest("hex")
  );
});

test("dry-run threshold skips never claim to have written an output directory", async () => {
  const path = await fixture(createPdf());
  const outputDir = join(path, "..", "dry-out");
  const result = await optimizeFile(path, {
    checkDependencies: false,
    dryRun: true,
    threshold: 1000000,
    outputDir,
  });
  expect(result.status).toBe("skipped");
  expect(result.wroteOutput).toBe(false);
  await expect(readFile(join(outputDir, "input.pdf"))).rejects.toThrow();
});
