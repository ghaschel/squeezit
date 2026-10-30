import { execFile } from "node:child_process";
import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";

import { glob } from "glob";
import { dest, src } from "gulp";
import { afterEach, describe, expect, test } from "vitest";

import {
  createGulpOptimizationOptions,
  squeezitGulp,
} from "../../src/integrations/gulp";
import {
  hasRepresentativeFixture,
  representativeFixtures,
} from "../helpers/fixture-manifest";
import { assertBuiltPdfAssets } from "../helpers/pdf-adapters";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];
const gulpFixtureKeys = [
  "pdf",
  "pdfProtected",
  "png",
  "apng",
  "gif",
  "webp",
  "svg",
  "heif",
  "heic",
  "avif",
  "bmp",
  "ico",
  "cur",
  "jxl",
] as const;
const rawFixtureKeys = ["arw", "cr2", "nef", "orf", "raf"] as const;
const gulpAssetPattern =
  "**/*.{pdf,png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}";

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("gulp integration", () => {
  test("optimizes eligible PDFs and preserves protected PDFs through real Gulp buffers, streams, and paths", async () => {
    const workspace = await createWorkspace();
    const input = await scaffoldInputFixtures(workspace, true);
    for (const kind of ["buffer", "stream", "path"]) {
      const outDir = join(workspace, `pdf-optimized-${kind}`);
      await runGulpPipeline(input, outDir, {
        plugin: squeezitGulp(),
        buffer: kind !== "stream",
        read: kind !== "path",
      });
      await findBuiltAssets(outDir);
    }
  });

  test("creates a transform that uses default mode with metadata stripping", () => {
    const stream = squeezitGulp();
    const options = createGulpOptimizationOptions("/tmp/gulp-out", false);

    expect(typeof stream._transform).toBe("function");
    expect(stream.readableObjectMode).toBe(true);
    expect(stream.writableObjectMode).toBe(true);
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("uses the explicit web-allowed fixture set and excludes raw fixtures", () => {
    const fixtures = getGulpFixtures();

    expect(fixtures.map((fixture) => fixture.key)).toEqual(
      gulpFixtureKeys.filter((key) => hasRepresentativeFixture(key))
    );
    expect(
      fixtures.some((fixture) =>
        rawFixtureKeys.includes(fixture.key as (typeof rawFixtureKeys)[number])
      )
    ).toBe(false);
  });

  test("optimizes total emitted image asset size for buffered vinyl files", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "baseline"));
    await runGulpPipeline(inputDir, join(workspace, "optimized"), {
      plugin: squeezitGulp(),
    });

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const optimizedAssets = await findBuiltAssets(join(workspace, "optimized"));

    expect(baselineAssets.length).toBeGreaterThan(0);
    expect(optimizedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(optimizedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test("can be disabled explicitly without changing emitted image asset size", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "baseline"));
    await runGulpPipeline(inputDir, join(workspace, "disabled"), {
      plugin: squeezitGulp({ enabled: false }),
    });

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const disabledAssets = await findBuiltAssets(join(workspace, "disabled"));

    expect(disabledAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(disabledAssets)).toBe(
      await totalAssetSize(baselineAssets)
    );
  });

  test("supports path-backed vinyl files via read:false pipelines", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "path-backed"), {
      plugin: squeezitGulp(),
      read: false,
    });

    const assets = await findBuiltAssets(join(workspace, "path-backed"));
    expect(assets.length).toBeGreaterThan(0);
  });

  test("supports streaming vinyl contents by buffering them internally", async () => {
    const workspace = await createWorkspace();
    const inputDir = await scaffoldInputFixtures(workspace);

    await runGulpPipeline(inputDir, join(workspace, "baseline"));
    await runGulpPipeline(inputDir, join(workspace, "streamed"), {
      plugin: squeezitGulp(),
      buffer: false,
    });

    const baselineAssets = await findBuiltAssets(join(workspace, "baseline"));
    const streamedAssets = await findBuiltAssets(join(workspace, "streamed"));

    expect(streamedAssets).toHaveLength(baselineAssets.length);
    expect(await totalAssetSize(streamedAssets)).toBeLessThan(
      await totalAssetSize(baselineAssets)
    );
  });

  test.each(["buffer", "stream", "path"])(
    "preserves protected PDF %s contents even when a Vinyl path contains other bytes",
    async (kind) => {
      const workspace = await createWorkspace();
      const path = join(workspace, "document.pdf");
      const protectedBytes = await readFile(
        representativeFixtures.pdfProtected
      );
      await cp(
        kind === "path"
          ? representativeFixtures.pdfProtected
          : representativeFixtures.pdf,
        path
      );
      const diskBefore = await readFile(path);
      const file = {
        path,
        contents:
          kind === "buffer"
            ? protectedBytes
            : kind === "stream"
              ? Readable.from([protectedBytes])
              : null,
        stat: { size: protectedBytes.length },
        isBuffer: () => kind === "buffer",
        isStream: () => kind === "stream",
        isNull: () => kind === "path",
      };
      const result = await runSingleVinylThroughPlugin(
        squeezitGulp({ checkDependencies: false }),
        file
      );
      expect(result.contents).toEqual(protectedBytes);
      expect(result.path).toBe(path);
      expect(result.stat.size).toBe(protectedBytes.length);
      expect(await readFile(path)).toEqual(diskBefore);
    }
  );

  test("preserves empty-password encrypted PDF streams without touching their disk path", async () => {
    const workspace = await createWorkspace();
    const path = join(workspace, "encrypted.pdf");
    await promisify(execFile)("qpdf", [
      "--encrypt",
      "",
      "fixture-owner",
      "256",
      "--",
      representativeFixtures.pdf,
      path,
    ]);
    const encrypted = await readFile(path);
    const file = {
      path,
      contents: Readable.from([encrypted]),
      stat: { size: encrypted.length },
      isBuffer: () => false,
      isStream: () => true,
      isNull: () => false,
    };
    const result = await runSingleVinylThroughPlugin(
      squeezitGulp({ checkDependencies: false }),
      file
    );
    expect(result.contents).toEqual(encrypted);
    expect(result.stat.size).toBe(encrypted.length);
    expect(await readFile(path)).toEqual(encrypted);
  });

  test("passes through null vinyl files without a usable path", async () => {
    const plugin = squeezitGulp();
    const file = {
      relative: "virtual.png",
      contents: null,
      isBuffer: () => false,
      isStream: () => false,
      isNull: () => true,
    };

    const result = await runSingleVinylThroughPlugin(plugin, file);

    expect(result).toBe(file);
    expect(result.contents).toBeNull();
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-gulp-");
  workspaces.push(workspace);
  return workspace;
}

async function scaffoldInputFixtures(
  workspace: string,
  pdfOnly = false
): Promise<string> {
  const inputDir = join(workspace, "input");
  await mkdir(inputDir, { recursive: true });

  const fixtures = getGulpFixtures(pdfOnly);
  for (const fixture of fixtures) {
    await cp(fixture.sourcePath, join(inputDir, fixture.fileName));
  }

  return inputDir;
}

async function runGulpPipeline(
  inputDir: string,
  outputDir: string,
  options: {
    plugin?: ReturnType<typeof squeezitGulp>;
    read?: boolean;
    buffer?: boolean;
  } = {}
): Promise<void> {
  // Gulp 5 supports binary encoding:false; its DefinitelyTyped SrcOptions
  // still describes the older host interface.
  const sourceOptions = {
    encoding: false,
    cwd: inputDir,
    read: options.read ?? true,
    buffer: options.buffer ?? true,
  };
  const sourceStream = src(join(inputDir, "*"), sourceOptions);

  const stages: NodeJS.ReadWriteStream[] = [sourceStream];
  if (options.plugin) {
    stages.push(options.plugin);
  }
  stages.push(dest(outputDir));

  await runStreamChain(stages);
}

async function runStreamChain(stages: NodeJS.ReadWriteStream[]): Promise<void> {
  const [firstStage, ...remainingStages] = stages;
  if (!firstStage) {
    throw new Error("No Gulp pipeline stages were created.");
  }

  await new Promise<void>((resolve, reject) => {
    let tail = firstStage;

    for (const stage of remainingStages) {
      tail = tail.pipe(stage);
    }

    tail.on("finish", resolve);
    tail.on("error", reject);
    firstStage.on("error", reject);
    for (const stage of remainingStages) {
      stage.on("error", reject);
    }
  });
}

async function runSingleVinylThroughPlugin<T>(
  plugin: NodeJS.ReadWriteStream,
  file: T
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    plugin.once("data", (chunk) => resolve(chunk as T));
    plugin.once("error", reject);
    plugin.once("end", () => resolve(file));
    plugin.write(file);
    plugin.end();
  });
}

async function findBuiltAssets(directory: string): Promise<string[]> {
  const matches = await glob(gulpAssetPattern, {
    cwd: directory,
    absolute: true,
    nodir: true,
  });

  const assets = matches.sort();
  await assertBuiltPdfAssets(assets);
  if (assets.length === 0) {
    throw new Error(`Expected built image assets in ${directory}, found none.`);
  }

  return assets;
}

async function totalAssetSize(paths: string[]): Promise<number> {
  const sizes = await Promise.all(
    paths.map(async (path) => (await stat(path)).size)
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function getGulpFixtures(pdfOnly = false): Array<{
  key: string;
  sourcePath: string;
  fileName: string;
}> {
  return gulpFixtureKeys
    .filter((key) => !pdfOnly || key === "pdf" || key === "pdfProtected")
    .filter((key) => hasRepresentativeFixture(key))
    .map((key) => {
      const sourcePath = representativeFixtures[key];

      return {
        key,
        sourcePath,
        fileName: `${key}${extname(sourcePath)}`,
      };
    });
}
