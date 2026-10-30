import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import { normalizeFileOptions } from "../../src/api/options";
import { inspectPdf, runPdfCommand } from "../../src/core/pdf";
import { optimizeImage } from "../../src/utils/optimizer";
import { createPdf, signatureFieldPdf } from "../helpers/pdf";

const realQpdf = execFileSync("which", ["qpdf"]).toString().trim();
let directory: string;
let oldPath: string | undefined;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "sqz-pdf-process-"));
  oldPath = process.env.PATH;
});
afterEach(async () => {
  process.env.PATH = oldPath;
  await rm(directory, { recursive: true, force: true });
});
async function fakeQpdf(script: string) {
  const executable = join(directory, "qpdf");
  await writeFile(executable, `#!${process.execPath}\n${script}\n`);
  await chmod(executable, 0o755);
  process.env.PATH = `${directory}:${oldPath}`;
}
async function input() {
  const path = join(directory, "input.pdf");
  await writeFile(path, createPdf());
  return path;
}
const delegate = `const {spawnSync}=require('node:child_process'); const r=spawnSync(${JSON.stringify(realQpdf)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status ?? 1);`;

describe("bounded PDF subprocess and publication policy", () => {
  test("kills timed-out inspection without accepting partial output", async () => {
    await fakeQpdf("process.stdout.write('{}');setInterval(()=>{},1000);");
    expect((await runPdfCommand(["--json"], { timeoutMs: 30 })).limited).toBe(
      true
    );
  });
  test("caps inspection output and discards partial JSON", async () => {
    await fakeQpdf("process.stdout.write('x'.repeat(10000));");
    const result = await runPdfCommand([], { maxBytes: 100 });
    expect(result.limited).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(100);
  });
  test("unsets ambient QPDF_ZOPFLI", async () => {
    const previous = process.env.QPDF_ZOPFLI;
    process.env.QPDF_ZOPFLI = "force";
    try {
      await fakeQpdf("process.stdout.write(String(process.env.QPDF_ZOPFLI));");
      expect((await runPdfCommand([])).stdout).toBe("undefined");
    } finally {
      if (previous === undefined) delete process.env.QPDF_ZOPFLI;
      else process.env.QPDF_ZOPFLI = previous;
    }
  });
  test("fails if qpdf is missing even when optional dependency checks are disabled", async () => {
    const path = await input();
    process.env.PATH = directory;
    const result = await optimizeFile(path, { checkDependencies: false });
    expect(result.status).toBe("failed");
    expect(result.wroteOutput).toBe(false);
    expect(await readFile(path)).toEqual(createPdf());
  });
  test("metadata-only operation does not need qpdf", async () => {
    const path = await input();
    process.env.PATH = directory;
    expect(
      (await optimizeFile(path, { mode: "exif", checkDependencies: false }))
        .skipReason
    ).toBe("pdf-metadata-unsupported");
  });
  test("rejects unsupported qpdf despite disabled prechecks", async () => {
    const path = await input();
    await fakeQpdf("console.log('qpdf version 10.6.3');");
    expect(
      (await optimizeFile(path, { checkDependencies: false })).status
    ).toBe("failed");
  });
  test("treats inspection warnings as inconclusive", async () => {
    const path = await input();
    await fakeQpdf(
      `if(process.argv.includes('--check')) { console.error('warning');process.exit(3); } ${delegate}`
    );
    expect(await inspectPdf(path)).toMatchObject({
      reason: "pdf-inspection-inconclusive",
    });
  });
  test("uses a valid max candidate when the other rewrite fails", async () => {
    const path = await input();
    await fakeQpdf(
      `if(process.argv.includes('--compression-level=6')) process.exit(2); ${delegate}`
    );
    expect(
      (await optimizeFile(path, { checkDependencies: false, mode: "max" }))
        .status
    ).toBe("optimized");
  });
  test("leaves input unchanged when every rewrite fails", async () => {
    const path = await input();
    await fakeQpdf(
      `if(process.argv.some(a=>a.startsWith('--compression-level='))) process.exit(2); ${delegate}`
    );
    const result = await optimizeFile(path, {
      checkDependencies: false,
      mode: "max",
    });
    expect(result.status).toBe("failed");
    expect(result.wroteOutput).toBe(false);
    expect(await readFile(path)).toEqual(createPdf());
  });
  test.each([0, 1000000])(
    "rejects source changes before publication at threshold %s",
    async (threshold) => {
      const path = await input();
      const target = join(directory, "destination.pdf");
      await writeFile(target, "existing destination");
      let calls = 0;
      const result = await optimizeImage(
        {
          absolutePath: path,
          displayPath: "input.pdf",
          outputPath: target,
          preserveOriginal: true,
        },
        normalizeFileOptions({ threshold }).core,
        {
          verify: async () => {
            if (++calls === 2)
              await writeFile(path, "concurrently changed source");
          },
        }
      );
      expect(result.status).toBe("failed");
      expect(result.message).toContain("source changed");
      expect(await readFile(target, "utf8")).toBe("existing destination");
      expect(await readFile(path, "utf8")).toBe("concurrently changed source");
    }
  );
  test.each([
    { name: "protected", bytes: signatureFieldPdf(), dryRun: false },
    {
      name: "inconclusive",
      bytes: Buffer.from("%PDF-1.7\nbroken"),
      dryRun: false,
    },
    { name: "below threshold", bytes: createPdf(), dryRun: false },
    { name: "dry run below threshold", bytes: createPdf(), dryRun: true },
  ])(
    "rejects source changes even when $name would skip without writing",
    async ({ bytes, dryRun }) => {
      const path = await input();
      await writeFile(path, bytes);
      await fakeQpdf(
        `if(process.argv.includes('--is-encrypted')) require('node:fs').writeFileSync(${JSON.stringify(path)}, 'concurrently changed source'); ${delegate}`
      );
      const result = await optimizeFile(path, {
        checkDependencies: false,
        threshold: 1000000,
        dryRun,
      });
      expect(result.status).toBe("failed");
      expect(result.message).toContain("source changed");
      expect(result.wroteOutput).toBe(false);
      expect(await readFile(path, "utf8")).toBe("concurrently changed source");
    }
  );
});

test("does not replace a smaller source using a stale pre-snapshot size", async () => {
  const path = await input();
  const smaller = createPdf({ content: "" });
  let calls = 0;
  const result = await optimizeImage(
    { absolutePath: path, displayPath: "input.pdf" },
    normalizeFileOptions({ threshold: 0 }).core,
    {
      verify: async () => {
        if (++calls === 1) await writeFile(path, smaller);
      },
    }
  );
  expect(result.status).not.toBe("optimized");
  expect(await readFile(path)).toEqual(smaller);
});

test("fails incompatible JSON capability rather than classifying document as a skip", async () => {
  const path = await input();
  await fakeQpdf(
    `if(process.argv.some(a=>a.startsWith('--json'))) {console.error('unsupported option');process.exit(2);} ${delegate}`
  );
  expect((await optimizeFile(path, { checkDependencies: false })).status).toBe(
    "failed"
  );
});
