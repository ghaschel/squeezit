import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";

import { expect } from "vitest";

import { representativeFixtures } from "./fixture-manifest";

const run = promisify(execFile);

/** Shared real-host checks: protected bytes and preserved safe-PDF metadata. */
export async function assertBuiltPdfAssets(assets: string[]): Promise<void> {
  const pdfs = assets.filter((path) => path.toLowerCase().endsWith(".pdf"));
  expect(pdfs.length).toBeGreaterThanOrEqual(2);
  const protectedBytes = await readFile(representativeFixtures.pdfProtected);
  const originalBytes = await readFile(representativeFixtures.pdf);
  for (const path of pdfs) {
    const contents = await readFile(path);
    if (basename(path).includes("pdfProtected")) {
      expect(contents).toEqual(protectedBytes);
    } else {
      expect(contents.length).toBeLessThanOrEqual(originalBytes.length);
      if (path.includes("disabled")) expect(contents).toEqual(originalBytes);
      if (path.includes("optimized"))
        expect(contents.length, path).toBeLessThan(originalBytes.length);
      const [original, output] = await Promise.all([
        run("qpdf", [
          "--json",
          "--json-stream-data=none",
          representativeFixtures.pdf,
        ]),
        run("qpdf", ["--json", "--json-stream-data=none", path]),
      ]);
      // Object numbering and stream compression may change; decoded page data
      // and metadata are checked by the shared PDF suite. Here ensure each
      // host emits a valid document with the same page count and Info values.
      const before = JSON.parse(original.stdout);
      const after = JSON.parse(output.stdout);
      expect(after.pages).toHaveLength(before.pages.length);
      const info = (json: typeof before) => {
        const objects = json.qpdf[1];
        const ref = objects.trailer.value["/Info"];
        return ref ? objects[`obj:${ref}`].value : null;
      };
      expect(info(after)).toEqual(info(before));
    }
  }
}
