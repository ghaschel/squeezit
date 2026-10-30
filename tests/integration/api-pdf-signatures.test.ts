import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { optimizeFile } from "../../src/api";

const fixtureRoot = resolve("tests/fixtures/formats/pdf/signatures");
const workspaces: string[] = [];
const fixtureNames = [
  "signed-valid.pdf",
  "signed-invalid.pdf",
  "signed-expired.pdf",
  "certification-structure.pdf",
  "timestamp-structure.pdf",
] as const;
async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-pdf-signature-"));
  workspaces.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

/** Reconstruct exactly the signed bytes and trim DER without discarding data
 * based on a zero-byte search (zero bytes are legal inside CMS structures). */
function signatureParts(bytes: Buffer): { covered: Buffer; cms: Buffer } {
  const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(
    bytes.toString("latin1")
  );
  expect(range).not.toBeNull();
  const [offset, length, secondOffset, secondLength] = range!
    .slice(1)
    .map(Number) as [number, number, number, number];
  expect(offset).toBe(0);
  expect(length).toBeGreaterThan(0);
  expect(secondOffset + secondLength).toBe(bytes.length);
  expect(bytes[length]).toBe(0x3c);
  expect(bytes[secondOffset - 1]).toBe(0x3e);
  const padded = Buffer.from(
    bytes.subarray(length + 1, secondOffset - 1).toString("ascii"),
    "hex"
  );
  expect(padded[0]).toBe(0x30);
  const lengthByte = padded[1]!;
  const count = lengthByte & 0x80 ? lengthByte & 0x7f : 0;
  expect(count).toBeLessThanOrEqual(4);
  const bodyLength = count ? padded.readUIntBE(2, count) : lengthByte;
  const cmsLength = 2 + count + bodyLength;
  expect(cmsLength).toBeLessThanOrEqual(padded.length);
  expect(padded.subarray(cmsLength).every((byte) => byte === 0)).toBe(true);
  return {
    cms: padded.subarray(0, cmsLength),
    covered: Buffer.concat([
      bytes.subarray(0, length),
      bytes.subarray(secondOffset),
    ]),
  };
}

async function verifyCms(name: string, signer: "valid" | "expired") {
  const directory = await workspace();
  const parts = signatureParts(await readFile(join(fixtureRoot, name)));
  await writeFile(join(directory, "signature.der"), parts.cms);
  await writeFile(join(directory, "covered.bin"), parts.covered);
  const result = spawnSync(
    "openssl",
    [
      "cms",
      "-verify",
      "-binary",
      "-inform",
      "DER",
      "-in",
      join(directory, "signature.der"),
      "-content",
      join(directory, "covered.bin"),
      "-nointern",
      "-certfile",
      join(fixtureRoot, `${signer}-signer.pem`),
      "-noverify",
      "-out",
      join(directory, "verified.bin"),
    ],
    { encoding: "utf8" }
  );
  expect(result.error).toBeUndefined();
  return { ...result, parts, directory };
}

describe("authentic PDF signature fixtures", () => {
  test("checks recorded fixture provenance and contains only public signer certificates", async () => {
    const manifest = JSON.parse(
      await readFile(join(fixtureRoot, "checksums.json"), "utf8")
    ) as { sha256: Record<string, string> };
    for (const [name, checksum] of Object.entries(manifest.sha256)) {
      const bytes = await readFile(join(fixtureRoot, name));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksum);
      expect(bytes.includes(Buffer.from("PRIVATE KEY"))).toBe(false);
      if (name.endsWith(".pdf")) {
        const checked = spawnSync(
          "qpdf",
          ["--suppress-recovery", "--check", join(fixtureRoot, name)],
          { encoding: "utf8" }
        );
        expect(checked.error).toBeUndefined();
        expect(checked.status, checked.stderr).toBe(0);
      }
    }
  });

  test.each(["signed-valid.pdf", "certification-structure.pdf"])(
    "verifies the detached CMS against complete ByteRange coverage in %s",
    async (name) => {
      const result = await verifyCms(name, "valid");
      expect(result.status, result.stderr).toBe(0);
      expect(await readFile(join(result.directory, "verified.bin"))).toEqual(
        result.parts.covered
      );
    }
  );

  test("the tampered signature has matching ByteRange/CMS structure but fails cryptographic integrity", async () => {
    const valid = signatureParts(
      await readFile(join(fixtureRoot, "signed-valid.pdf"))
    );
    const invalid = await verifyCms("signed-invalid.pdf", "valid");
    expect(invalid.parts.cms).toEqual(valid.cms);
    expect(invalid.parts.covered).not.toEqual(valid.covered);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(
      /verification failure|content verify error/i
    );
  });

  test("an expired signer retains a valid CMS signature while failing certificate-date validation", async () => {
    const signed = await verifyCms("signed-expired.pdf", "expired");
    expect(signed.status, signed.stderr).toBe(0);
    // Explicit local trust anchors isolate date validity. This does not assert
    // public CA trust, identity, revocation status, or trusted signing time.
    for (const signer of ["valid", "expired"] as const) {
      const certificate = join(fixtureRoot, `${signer}-signer.pem`);
      const checked = spawnSync(
        "openssl",
        [
          "verify",
          "-CAfile",
          certificate,
          "-purpose",
          "any",
          "-attime",
          "1893456000",
          certificate,
        ],
        { encoding: "utf8" }
      );
      expect(checked.error).toBeUndefined();
      if (signer === "valid") expect(checked.status, checked.stderr).toBe(0);
      else {
        expect(checked.status).not.toBe(0);
        expect(checked.stderr).toMatch(/certificate has expired/i);
      }
    }
  });
});

describe("PDF signature protection across accepted optimization modes", () => {
  for (const mode of ["default", "max"] as const) {
    test.each(fixtureNames)(
      `${mode} skips %s without changing source or existing output`,
      async (name) => {
        const directory = await workspace();
        const source = join(directory, name);
        const bytes = await readFile(join(fixtureRoot, name));
        await writeFile(source, bytes);
        const outputDir = join(directory, "output");
        await mkdir(outputDir);
        const existing = Buffer.from(
          "existing output must remain byte-identical"
        );
        await writeFile(join(outputDir, name), existing);
        const result = await optimizeFile(source, {
          mode,
          stripMetadata: true,
          outputDir,
          checkDependencies: false,
        });
        expect(result.status).toBe("skipped");
        expect(result.skipReason).toMatch(/^pdf-signature/);
        expect(result.changed).toBe(false);
        expect(result.wroteOutput).toBe(false);
        expect(result.savedBytes).toBe(0);
        expect(await readFile(source)).toEqual(bytes);
        expect(await readFile(join(outputDir, name))).toEqual(existing);
      }
    );
  }
});
