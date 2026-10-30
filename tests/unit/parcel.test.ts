import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ optimizeAsset: vi.fn() }));
vi.mock("../../src/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/core")>()),
  optimizeAsset: hoisted.optimizeAsset,
}));

import {
  createParcelOptimizationOptions,
  loadParcelPluginConfigFromProjectRoot,
  normalizeParcelPluginConfig,
  squeezitParcel,
} from "../../src/integrations/parcel";
import { cleanupWorkspace, createTempWorkspace } from "../helpers/temp";

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
});

describe("parcel integration helpers", () => {
  test("creates default optimization options with metadata stripping enabled", () => {
    const options = createParcelOptimizationOptions("/tmp/parcel-out", false);

    expect(options.cwd).toBe("/tmp/parcel-out");
    expect(options.mode).toBe("default");
    expect(options.stripMetadata).toBe(true);
    expect(options.checkDependencies).toBe(false);
  });

  test("returns normalized original PDF bytes after consuming a skipped Readable", async () => {
    const bytes = Buffer.concat([
      Buffer.from("%PDF-1.7"),
      Buffer.from([0xff, 0, 0x80]),
    ]);
    hoisted.optimizeAsset.mockResolvedValue({
      contents: bytes,
      result: { status: "skipped", skipReason: "pdf-encrypted" },
    });
    const plugin = (
      squeezitParcel as unknown as Record<
        symbol,
        {
          optimize(
            args: unknown
          ): Promise<{ contents: Buffer; map: unknown; type: string }>;
        }
      >
    )[Symbol.for("parcel-plugin-config")];
    const map = { original: true };
    const result = await plugin!.optimize({
      bundle: { type: "pdf", displayName: "document.pdf" },
      contents: Readable.from([bytes]),
      map,
      options: { mode: "production", projectRoot: "/tmp" },
      config: { enabled: true, productionOnly: true, checkDependencies: false },
    });
    expect(result).toEqual({ contents: bytes, map, type: "pdf" });
    expect(hoisted.optimizeAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contents: bytes }),
      expect.anything()
    );
  });

  test("normalizes parcel config with defaults", () => {
    expect(normalizeParcelPluginConfig(undefined)).toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
    expect(normalizeParcelPluginConfig("invalid")).toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
  });

  test("normalizes only valid boolean parcel config values", () => {
    expect(
      normalizeParcelPluginConfig({
        enabled: false,
        checkDependencies: "nope",
        productionOnly: false,
      })
    ).toEqual({
      enabled: false,
      checkDependencies: true,
      productionOnly: false,
    });
  });

  test("loads parcel config from package.json", async () => {
    const workspace = await createWorkspace();
    await mkdir(workspace, { recursive: true });
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify(
        {
          name: "parcel-config-test",
          squeezit: {
            parcel: {
              enabled: false,
              checkDependencies: false,
              productionOnly: false,
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(
      loadParcelPluginConfigFromProjectRoot(workspace)
    ).resolves.toEqual({
      enabled: false,
      checkDependencies: false,
      productionOnly: false,
    });
  });

  test("falls back to defaults when package.json is missing or invalid", async () => {
    const missingWorkspace = await createWorkspace();
    const invalidWorkspace = await createWorkspace();
    await writeFile(join(invalidWorkspace, "package.json"), "{", "utf8");

    await expect(
      loadParcelPluginConfigFromProjectRoot(missingWorkspace)
    ).resolves.toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });

    await expect(
      loadParcelPluginConfigFromProjectRoot(invalidWorkspace)
    ).resolves.toEqual({
      enabled: true,
      checkDependencies: true,
      productionOnly: true,
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await createTempWorkspace("squeezit-parcel-unit-");
  workspaces.push(workspace);
  return workspace;
}
