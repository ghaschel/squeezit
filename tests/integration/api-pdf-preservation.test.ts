import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import checksums from "../fixtures/formats/pdf/preservation/checksums.json";

const fixtures = resolve(
  import.meta.dirname,
  "../fixtures/formats/pdf/preservation"
);
const workspaces: string[] = [];
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), "squeezit-pdf-preservation-"));
  workspaces.push(workspace);
  const input = join(workspace, "document.pdf");
  await copyFile(join(fixtures, "jpx-embedded-font.pdf"), input);
  return { workspace, input };
}

function qpdf(args: string[]): Buffer {
  return execFileSync("qpdf", args, {
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function embeddedPayloads(path: string) {
  const json = JSON.parse(
    qpdf(["--json=2", "--json-stream-data=none", path]).toString()
  ) as {
    qpdf: [
      unknown,
      Record<
        string,
        {
          value?: Record<string, unknown>;
          stream?: { dict: Record<string, unknown> };
        }
      >,
    ];
  };
  const objects = Object.entries(json.qpdf[1]);
  const image = objects.find(
    ([, object]) => object.stream?.dict["/Filter"] === "/JPXDecode"
  );
  expect(image, "a compressed JPX image must remain embedded").toBeDefined();
  expect(image![1].stream!.dict).toMatchObject({
    "/Width": 8,
    "/Height": 8,
    "/BitsPerComponent": 8,
    "/ColorSpace": "/DeviceRGB",
  });
  const font = objects.find(
    ([, object]) => object.value?.["/Type"] === "/FontDescriptor"
  );
  expect(
    font,
    "the original embedded font descriptor must remain"
  ).toBeDefined();
  expect(font![1].value).toMatchObject({
    "/FontName": "/SqueezitFixture-Regular",
    "/Ascent": 800,
    "/Descent": -200,
  });
  const fontReference = font![1].value!["/FontFile2"];
  expect(
    fontReference,
    "TrueType program must not be replaced by a system font"
  ).toMatch(/^\d+ \d+ R$/);
  const fontId = String(fontReference).split(" ")[0];
  const imageId = image![0].slice(4).split(" ")[0];
  return {
    jpx: qpdf([`--show-object=${imageId}`, "--raw-stream-data", path]),
    font: qpdf([
      `--show-object=${fontId}`,
      "--decode-level=generalized",
      "--filtered-stream-data",
      path,
    ]),
  };
}

async function render(input: string, prefix: string, fontConfig: string) {
  execFileSync(
    "pdftoppm",
    ["-singlefile", "-scale-to", "400", "-png", input, prefix],
    {
      timeout: 30000,
      env: { ...process.env, FONTCONFIG_FILE: fontConfig },
    }
  );
  return readFile(`${prefix}.png`);
}

// Catches image re-encoding, font substitution/removal, altered resources, or
// page-content edits even if QPDF still accepts the resulting PDF structure.
test.each(["default", "max"] as const)(
  "%s preserves compressed JPX, embedded TrueType bytes and rendered content",
  async (mode) => {
    const { workspace, input } = await fixture();
    expect(digest(await readFile(input))).toBe(
      checksums["jpx-embedded-font.pdf"]
    );
    const before = embeddedPayloads(input);
    expect(digest(before.jpx)).toBe(checksums["original.jp2"]);
    expect(digest(before.font)).toBe(checksums["original.ttf"]);
    const fontConfig = join(workspace, "fonts.conf");
    await writeFile(
      fontConfig,
      `<fontconfig><dir>${workspace}</dir><cachedir>${workspace}/font-cache</cachedir></fontconfig>`
    );
    const renderedBefore = await render(
      input,
      join(workspace, "before"),
      fontConfig
    );
    const preview = await optimizeFile(input, {
      mode,
      dryRun: true,
      checkDependencies: false,
    });
    expect(preview.status).toBe("dry-run");
    const result = await optimizeFile(input, {
      mode,
      checkDependencies: false,
    });
    expect(result.status).toBe("optimized");
    expect(result.optimizedSize).toBeLessThan(result.originalSize);
    const after = embeddedPayloads(input);
    expect(digest(after.jpx)).toBe(checksums["original.jp2"]);
    expect(digest(after.font)).toBe(checksums["original.ttf"]);
    expect(
      digest(await render(input, join(workspace, "after"), fontConfig))
    ).toBe(digest(renderedBefore));
  }
);

// Catches replacement/copy paths forgetting the requested original timestamp.
test.each([false, true])(
  "keepTime retains PDF mtime with outputDir=%s",
  async (separateOutput) => {
    const { workspace, input } = await fixture();
    const timestamp = new Date("2020-01-02T03:04:05.000Z");
    await utimes(input, timestamp, timestamp);
    const options = {
      cwd: workspace,
      keepTime: true,
      checkDependencies: false,
      ...(separateOutput ? { outputDir: join(workspace, "out") } : {}),
    };
    expect(
      (await optimizeFile(input, { ...options, dryRun: true })).status
    ).toBe("dry-run");
    const result = await optimizeFile(input, options);
    expect(result.status).toBe("optimized");
    const output = separateOutput ? join(workspace, "out/document.pdf") : input;
    expect((await stat(output)).mtimeMs).toBe(timestamp.getTime());
    expect((await stat(input)).mtimeMs).toBe(timestamp.getTime());
    if (separateOutput)
      expect(digest(await readFile(input))).toBe(
        checksums["jpx-embedded-font.pdf"]
      );
  }
);

// Catches publishing the rejected compressed candidate rather than original
// inspected bytes when an ordinary outputDir copy cannot meet the threshold.
test("threshold skip copies original PDF bytes to outputDir and retains mtime", async () => {
  const { workspace, input } = await fixture();
  const timestamp = new Date("2020-01-02T03:04:05.000Z");
  await utimes(input, timestamp, timestamp);
  const options = {
    cwd: workspace,
    outputDir: join(workspace, "out"),
    threshold: 1000000,
    keepTime: true,
    checkDependencies: false,
  };
  expect(
    (await optimizeFile(input, { ...options, dryRun: true })).wroteOutput
  ).toBe(false);
  const result = await optimizeFile(input, options);
  expect(result.status).toBe("skipped");
  expect(result.skipReason).toBeUndefined();
  expect(result.wroteOutput).toBe(true);
  const output = join(workspace, "out/document.pdf");
  expect((await stat(output)).mtimeMs).toBe(timestamp.getTime());
  expect(digest(await readFile(output))).toBe(
    checksums["jpx-embedded-font.pdf"]
  );
  expect(digest(await readFile(input))).toBe(
    checksums["jpx-embedded-font.pdf"]
  );
});
