import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, open, realpath, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type { PdfSkipReason } from "../types";

export type PdfInspection =
  | {
      eligible: true;
      pdfVersion: string;
      pageCount: number;
      executable?: string;
    }
  | { eligible: false; reason: PdfSkipReason; message: string };

const messages: Record<PdfSkipReason, string> = {
  "pdf-encrypted": "encrypted PDF left unchanged",
  "pdf-signature": "PDF signature or certification indication; left unchanged",
  "pdf-signature-field": "PDF signature field; left unchanged",
  "pdf-inspection-inconclusive":
    "PDF inspection was inconclusive; left unchanged",
  "pdf-unsupported-structure":
    "PDF revision history or signing structure is unsupported; left unchanged",
  "pdf-metadata-unsupported":
    "PDF metadata removal is unsupported; left unchanged",
};

export function pdfSkip(
  reason: PdfSkipReason
): Extract<PdfInspection, { eligible: false }> {
  return { eligible: false, reason, message: messages[reason] };
}

/** Recognize PDF bytes before RAW-extension shortcuts and image writers. */
export async function hasPdfHeader(path: string): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const bytes = Buffer.alloc(1024);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead).includes(Buffer.from("%PDF-"));
  } finally {
    await file.close();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Only structured dictionaries are inspected, never PDF text or stream data. */
export function classifyPdfJson(value: unknown): PdfInspection {
  const inconclusive = () => pdfSkip("pdf-inspection-inconclusive");
  if (
    !record(value) ||
    value.version !== 2 ||
    !record(value.encrypt) ||
    typeof value.encrypt.encrypted !== "boolean" ||
    !record(value.acroform) ||
    !Array.isArray(value.acroform.fields) ||
    typeof value.acroform.hasacroform !== "boolean" ||
    typeof value.acroform.needappearances !== "boolean" ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.qpdf) ||
    value.qpdf.length !== 2
  )
    return inconclusive();
  if (value.encrypt.encrypted) return pdfSkip("pdf-encrypted");
  const [header, objects] = value.qpdf;
  if (
    !record(header) ||
    header.jsonversion !== 2 ||
    header.calledgetallpages !== true ||
    !Number.isSafeInteger(header.maxobjectid) ||
    Number(header.maxobjectid) < 0 ||
    typeof header.pdfversion !== "string" ||
    !/^\d+\.\d+$/.test(header.pdfversion) ||
    !record(objects) ||
    !record(objects.trailer) ||
    !record(objects.trailer.value)
  )
    return inconclusive();
  const trailer = objects.trailer.value;
  for (const [key, object] of Object.entries(objects)) {
    if (key === "trailer") continue;
    if (!/^obj:\d+ \d+ R$/.test(key) || !record(object)) return inconclusive();
    if ("value" in object) continue;
    if (!record(object.stream) || !record(object.stream.dict))
      return inconclusive();
  }
  if (trailer["/Encrypt"] != null) return pdfSkip("pdf-encrypted");
  if (trailer["/Prev"] != null) return pdfSkip("pdf-unsupported-structure");

  function resolve(value: unknown): unknown {
    const seen = new Set<string>();
    while (typeof value === "string" && /^\d+ \d+ R$/.test(value)) {
      if (seen.has(value)) throw new Error("cyclic PDF object reference");
      seen.add(value);
      const object = objects![`obj:${value}`];
      if (!record(object) || !("value" in object))
        throw new Error("unresolved PDF object");
      value = object.value;
    }
    return value;
  }

  try {
    const root = resolve(trailer["/Root"]);
    if (!record(root) || resolve(root["/Type"]) !== "/Catalog")
      return inconclusive();
    const leaves = new Set<string>();
    const visited = new Set<string>();
    const tree: unknown[] = [root["/Pages"]];
    while (tree.length) {
      const reference = tree.pop();
      if (
        typeof reference !== "string" ||
        !/^\d+ \d+ R$/.test(reference) ||
        visited.has(reference)
      )
        return inconclusive();
      visited.add(reference);
      const node = resolve(reference);
      if (!record(node)) return inconclusive();
      const type = resolve(node["/Type"]);
      if (type === "/Page") leaves.add(reference);
      else if (
        type === "/Pages" &&
        Array.isArray(node["/Kids"]) &&
        Number.isSafeInteger(node["/Count"]) &&
        Number(node["/Count"]) >= 0
      )
        tree.push(...node["/Kids"]);
      else return inconclusive();
    }
    if (
      leaves.size !== value.pages.length ||
      new Set(value.pages.map((page) => (record(page) ? page.object : null)))
        .size !== value.pages.length
    )
      return inconclusive();
    const rootPages = resolve(root["/Pages"]);
    if (!record(rootPages) || rootPages["/Count"] !== leaves.size)
      return inconclusive();
    for (const page of value.pages) {
      if (
        !record(page) ||
        typeof page.object !== "string" ||
        !leaves.has(page.object) ||
        !Array.isArray(page.contents) ||
        !Array.isArray(page.images)
      )
        return inconclusive();
      const object = resolve(page.object);
      if (!record(object) || resolve(object["/Type"]) !== "/Page")
        return inconclusive();
    }
    // A stack avoids recursion limits on deeply nested, otherwise valid JSON.
    const pending: unknown[] = [objects, value.acroform];
    let field = false;
    while (pending.length) {
      const node = pending.pop();
      if (
        typeof node === "string" &&
        /^\d+ \d+ R$/.test(node) &&
        !(`obj:${node}` in objects)
      )
        return inconclusive();
      if (Array.isArray(node)) {
        pending.push(...node);
        continue;
      }
      if (!record(node)) continue;
      if (
        resolve(node["/Type"]) === "/Sig" ||
        resolve(node["/Type"]) === "/DocTimeStamp" ||
        node["/ByteRange"] != null ||
        node["/Perms"] != null
      )
        return pdfSkip("pdf-signature");
      if (node["/XFA"] != null) return pdfSkip("pdf-unsupported-structure");
      if (resolve(node["/FT"]) === "/Sig") {
        if (resolve(node["/V"]) != null) return pdfSkip("pdf-signature");
        field = true;
      }
      if (node["/SigFlags"] != null && resolve(node["/SigFlags"]) !== 0)
        field = true;
      pending.push(...Object.values(node));
    }
    if (field) return pdfSkip("pdf-signature-field");
    return {
      eligible: true,
      pdfVersion: header.pdfversion,
      pageCount: value.pages.length,
    };
  } catch {
    return inconclusive();
  }
}

interface PdfProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  limited: boolean;
}

/** Spawn errors reject; document errors and resource limits are inspectable results. */
export async function runPdfCommand(
  args: string[],
  limits: { timeoutMs?: number; maxBytes?: number; executable?: string } = {}
): Promise<PdfProcessResult> {
  const env = { ...process.env };
  delete env.QPDF_ZOPFLI;
  return new Promise((resolve, reject) => {
    const child = spawn(limits.executable ?? "qpdf", args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let limited = false;
    const stop = () => {
      limited = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(stop, limits.timeoutMs ?? 60_000);
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (limits.maxBytes ?? 64 * 1024 * 1024)) stop();
      else if (!limited) chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        limited,
      });
    });
  });
}

function clean(result: PdfProcessResult): boolean {
  return (
    result.exitCode === 0 && !result.limited && result.stderr.trim() === ""
  );
}

export type PdfProbeCache = Map<string, Promise<void>>;

async function resolveQpdf(): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory || ".", "qpdf");
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return await realpath(candidate);
    } catch {
      /* Continue PATH lookup; no valid executable means operational failure. */
    }
  }
  throw new Error("QPDF executable was not found or is not executable on PATH");
}

async function probeQpdf(executable: string): Promise<void> {
  const version = await runPdfCommand(["--version"], { executable });
  const match = version.stdout.match(/qpdf version (\d+)\.(\d+)\.(\d+)/);
  if (
    !clean(version) ||
    !match ||
    Number(match[1]) < 11 ||
    (Number(match[1]) === 11 && Number(match[2]) < 3)
  ) {
    throw new Error("QPDF >= 11.3.0 with JSON v2 support is required");
  }
  const capabilities = await runPdfCommand(["--json-help"], { executable });
  try {
    const help: unknown = JSON.parse(capabilities.stdout);
    if (
      !clean(capabilities) ||
      !record(help) ||
      !Array.isArray(help.qpdf) ||
      !Array.isArray(help.pages) ||
      !record(help.encrypt) ||
      !record(help.acroform)
    )
      throw new Error("unsupported JSON schema");
  } catch {
    throw new Error(
      "QPDF with JSON v2 object, page, encryption and form inspection is required"
    );
  }
}

export async function inspectPdf(
  inputPath: string,
  probes: PdfProbeCache = new Map()
): Promise<PdfInspection> {
  // Resolve once and cache only within the caller's run, never across PATH changes.
  const executable = await resolveQpdf();
  let probe = probes.get(executable);
  if (!probe) {
    probe = probeQpdf(executable);
    probes.set(executable, probe);
  }
  try {
    await probe;
  } catch (error) {
    probes.delete(executable);
    throw error;
  }
  const encrypted = await runPdfCommand(["--is-encrypted", inputPath], {
    executable,
  });
  if (encrypted.exitCode === 0 && !encrypted.limited)
    return pdfSkip("pdf-encrypted");
  if (encrypted.exitCode !== 2 || encrypted.limited || encrypted.stderr.trim())
    return pdfSkip("pdf-inspection-inconclusive");
  if (
    !clean(
      await runPdfCommand(["--suppress-recovery", "--check", inputPath], {
        executable,
      })
    )
  )
    return pdfSkip("pdf-inspection-inconclusive");
  const json = await runPdfCommand(
    ["--suppress-recovery", "--json=2", "--json-stream-data=none", inputPath],
    { executable }
  );
  if (!clean(json)) return pdfSkip("pdf-inspection-inconclusive");
  try {
    const inspection = classifyPdfJson(JSON.parse(json.stdout));
    return inspection.eligible ? { ...inspection, executable } : inspection;
  } catch {
    return pdfSkip("pdf-inspection-inconclusive");
  }
}

export async function optimizePdfSnapshot(params: {
  inputPath: string;
  workDir: string;
  max: boolean;
  pdfVersion: string;
  executable?: string;
}): Promise<{ outputPath: string; label: string }> {
  const { inputPath, workDir, max, pdfVersion, executable } = params;
  const candidates: { outputPath: string; size: number }[] = [];
  for (const level of max ? [6, 9] : [6]) {
    const outputPath = join(workDir, `compressed-${level}.pdf`);
    const result = await runPdfCommand(
      [
        "--suppress-recovery",
        `--object-streams=${Number(pdfVersion) < 1.5 ? "preserve" : "generate"}`,
        "--compress-streams=y",
        "--decode-level=generalized",
        "--recompress-flate",
        `--compression-level=${level}`,
        inputPath,
        outputPath,
      ],
      { timeoutMs: 120_000, executable }
    );
    if (!clean(result)) continue;
    if (
      !clean(
        await runPdfCommand(["--suppress-recovery", "--check", outputPath], {
          executable,
        })
      )
    )
      continue;
    candidates.push({ outputPath, size: (await stat(outputPath)).size });
  }
  candidates.sort((a, b) => a.size - b.size);
  if (!candidates[0])
    throw new Error("QPDF produced no valid compression candidate");
  return { outputPath: candidates[0].outputPath, label: "[PDF]" };
}
