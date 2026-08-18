import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import { beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ optimizeAsset: vi.fn() }));

vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, optimizeAsset: hoisted.optimizeAsset };
});

import {
  createRollupCoreOptions,
  renameRollupBundleAsset,
  resolveRenamedRollupAssetFileName,
  rewriteRollupBundleReferences,
  squeezitRollup,
} from "../../src/integrations/rollup";

describe("rollup helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("passes generated image assets through the buffer core bridge", async () => {
    const source = Buffer.from("unoptimized image bytes");
    const contents = Buffer.from("smaller image");
    hoisted.optimizeAsset.mockResolvedValue({
      contents,
      fileName: "sample.png",
      result: {
        filePath: "/tmp/sample.png",
        label: "[PNG]",
        optimizedSize: contents.length,
        originalSize: source.length,
        savedBytes: source.length - contents.length,
        status: "optimized",
      },
    });
    const asset = createOutputAsset("assets/sample.png", source);
    const bundle: OutputBundle = { "assets/sample.png": asset };
    const plugin = squeezitRollup({ checkDependencies: false });

    await runGenerateBundle(plugin, bundle);

    expect(hoisted.optimizeAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: source,
        fileName: "sample.png",
        kind: "buffer",
      }),
      createRollupCoreOptions()
    );
    expect(asset.source).toEqual(contents);
  });

  test("leaves unsupported generated assets untouched", async () => {
    const source = Buffer.from("hello");
    const asset = createOutputAsset("assets/sample.txt", source);
    const bundle: OutputBundle = { "assets/sample.txt": asset };
    const plugin = squeezitRollup({ checkDependencies: false });

    await runGenerateBundle(plugin, bundle);

    expect(hoisted.optimizeAsset).not.toHaveBeenCalled();
    expect(asset.source).toEqual(source);
  });

  test("derives a new hashed rollup asset file name from optimized bytes", () => {
    const asset = {
      fileName: "assets/hero-12345678.png",
      name: "hero.png",
      originalFileName: "src/assets/hero.png",
      names: ["hero.png"],
      originalFileNames: ["src/assets/hero.png"],
      needsCodeReference: false,
      source: Buffer.from("before"),
      type: "asset",
    } satisfies OutputAsset;

    const renamed = resolveRenamedRollupAssetFileName(
      asset,
      asset.fileName,
      Buffer.from("after")
    );

    expect(renamed).toMatch(/^assets\/hero-[a-f0-9]{8}\.png$/);
    expect(renamed).not.toBe(asset.fileName);
  });

  test("rewrites bundle references when an asset file name changes", () => {
    const asset = {
      fileName: "assets/hero-12345678.png",
      name: "hero.png",
      originalFileName: "src/assets/hero.png",
      names: ["hero.png"],
      originalFileNames: ["src/assets/hero.png"],
      needsCodeReference: false,
      source: Buffer.from("image"),
      type: "asset",
    } satisfies OutputAsset;
    const chunk = {
      type: "chunk",
      fileName: "bundle.js",
      code: 'console.log("assets/hero-12345678.png")',
      imports: [],
      dynamicImports: [],
      referencedFiles: ["assets/hero-12345678.png"],
    } as unknown as OutputChunk;
    const bundle: OutputBundle = {
      "assets/hero-12345678.png": asset,
      "bundle.js": chunk,
    };

    renameRollupBundleAsset(
      bundle,
      "assets/hero-12345678.png",
      "assets/hero-deadbeef.png"
    );

    expect(bundle["assets/hero-deadbeef.png"]).toBeDefined();
    expect(bundle["assets/hero-12345678.png"]).toBeUndefined();
    expect(chunk.code).toContain("assets/hero-deadbeef.png");
    expect(chunk.referencedFiles).toContain("assets/hero-deadbeef.png");
  });

  test("can rewrite references without renaming the bundle entry", () => {
    const chunk = {
      type: "chunk",
      fileName: "bundle.js",
      code: 'console.log("assets/poster-11111111.webp")',
      imports: [],
      dynamicImports: [],
      referencedFiles: ["assets/poster-11111111.webp"],
    } as unknown as OutputChunk;
    const bundle: OutputBundle = {
      "bundle.js": chunk,
    };

    rewriteRollupBundleReferences(
      bundle,
      "assets/poster-11111111.webp",
      "assets/poster-22222222.webp"
    );

    expect(chunk.code).toContain("assets/poster-22222222.webp");
    expect(chunk.referencedFiles).toContain("assets/poster-22222222.webp");
  });
});

function createOutputAsset(fileName: string, source: Buffer): OutputAsset {
  return {
    fileName,
    name: "sample.png",
    names: ["sample.png"],
    needsCodeReference: false,
    originalFileName: null,
    originalFileNames: [],
    source,
    type: "asset",
  };
}

async function runGenerateBundle(
  plugin: ReturnType<typeof squeezitRollup>,
  bundle: OutputBundle
): Promise<void> {
  const hook = plugin.generateBundle;
  if (typeof hook !== "function") {
    throw new Error("Expected the Rollup plugin to provide generateBundle.");
  }

  await hook.call({} as never, {} as never, bundle, false);
}
