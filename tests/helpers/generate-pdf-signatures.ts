/** Generate self-owned signature-policy fixtures. Private keys never leave a
 * temporary workspace and are removed on success or failure. Run with Bun. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createPdf } from "./pdf";

const output = resolve("tests/fixtures/formats/pdf/signatures");
const workspace = await mkdtemp(join(tmpdir(), "squeezit-test-signing-"));
const run = (...args: string[]) =>
  execFileSync("openssl", args, {
    cwd: workspace,
    stdio: ["ignore", "pipe", "pipe"],
  });
const receipts: Record<string, string> = {};
try {
  await mkdir(output, { recursive: true });
  await mkdir(join(workspace, "newcerts"));
  await writeFile(join(workspace, "index.txt"), "");
  await writeFile(join(workspace, "serial"), "01\n");
  await writeFile(
    join(workspace, "ca.cnf"),
    [
      "[ca]",
      "default_ca = test_ca",
      "[test_ca]",
      "database = index.txt",
      "new_certs_dir = newcerts",
      "serial = serial",
      "default_md = sha256",
      "policy = test_policy",
      "unique_subject = no",
      "x509_extensions = signing",
      "[test_policy]",
      "commonName = supplied",
      "[signing]",
      "basicConstraints = critical,CA:FALSE",
      "keyUsage = critical,digitalSignature",
      "subjectKeyIdentifier = hash",
      "authorityKeyIdentifier = keyid:always",
    ].join("\n")
  );

  for (const [name, end] of [
    ["valid", "20400101000000Z"],
    ["expired", "20210101000000Z"],
  ] as const) {
    run(
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-subj",
      `/CN=Squeezit test-only ${name} signer`,
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`
    );
    run(
      "ca",
      "-batch",
      "-selfsign",
      "-notext",
      "-config",
      "ca.cnf",
      "-keyfile",
      `${name}.key`,
      "-in",
      `${name}.csr`,
      "-out",
      `${name}.pem`,
      "-startdate",
      "20200101000000Z",
      "-enddate",
      end
    );
    await save(
      `${name}-signer.pem`,
      await readFile(join(workspace, `${name}.pem`))
    );
  }
  const valid = await sign("valid");
  await save("signed-valid.pdf", valid);
  const invalid = Buffer.from(valid);
  const needle = Buffer.from("Preserve this text");
  const position = invalid.indexOf(needle);
  if (position < 0) throw new Error("Missing tamper target");
  invalid[position] = "D".charCodeAt(0);
  await save("signed-invalid.pdf", invalid);
  await save("signed-expired.pdf", await sign("expired"));
  await save("certification-structure.pdf", await sign("valid", true));
  await save(
    "timestamp-structure.pdf",
    createPdf({
      catalog: "/AcroForm << /Fields [7 0 R] >>",
      objects: [
        "<< /FT /Sig /T (Synthetic timestamp marker) /V 8 0 R >>",
        "<< /Type /DocTimeStamp /SubFilter /ETSI.RFC3161 /ByteRange [0 1 2 3] /Contents <00> >>",
      ],
    })
  );
  await save(
    "checksums.json",
    Buffer.from(
      `${JSON.stringify({ openssl: run("version").toString().trim(), sha256: receipts }, null, 2)}\n`
    )
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}

async function save(name: string, contents: Buffer): Promise<void> {
  receipts[name] = createHash("sha256").update(contents).digest("hex");
  await writeFile(join(output, name), contents);
}

async function sign(
  signer: "valid" | "expired",
  certification = false
): Promise<Buffer> {
  const reference = certification
    ? "/Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P 1 /V /1.2 >> >>]"
    : "";
  const bytes = createPdf({
    catalog: `/AcroForm << /Fields [7 0 R] /SigFlags 3 >> ${certification ? "/Perms << /DocMDP 8 0 R >>" : ""}`,
    objects: [
      "<< /FT /Sig /T (Squeezit test-only signature) /V 8 0 R >>",
      `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <${"0".repeat(32768)}> ${reference} >>`,
    ],
  });
  const start = bytes.indexOf(Buffer.from("/Contents <")) + "/Contents ".length;
  const end = bytes.indexOf(">", start) + 1;
  const byteRange = [0, start, end, bytes.length - end];
  const placeholder = Buffer.from(
    "0000000000 0000000000 0000000000 0000000000"
  );
  bytes.write(
    byteRange.map((value) => String(value).padStart(10, "0")).join(" "),
    bytes.indexOf(placeholder),
    "ascii"
  );
  const covered = Buffer.concat([
    bytes.subarray(0, start),
    bytes.subarray(end),
  ]);
  await writeFile(join(workspace, "covered.bin"), covered);
  run(
    "cms",
    "-sign",
    "-binary",
    "-in",
    "covered.bin",
    "-signer",
    `${signer}.pem`,
    "-inkey",
    `${signer}.key`,
    "-outform",
    "DER",
    "-out",
    "signature.der",
    "-md",
    "sha256",
    "-nosmimecap"
  );
  const cms = await readFile(join(workspace, "signature.der"));
  if (cms.length * 2 > 32768) throw new Error("CMS exceeds reserved contents");
  bytes.write(cms.toString("hex"), start + 1, "ascii");
  run(
    "cms",
    "-verify",
    "-binary",
    "-inform",
    "DER",
    "-in",
    "signature.der",
    "-content",
    "covered.bin",
    "-noverify",
    "-out",
    "verified.bin"
  );
  return bytes;
}
