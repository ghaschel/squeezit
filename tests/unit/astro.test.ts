import { describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  optimize: vi.fn().mockResolvedValue({ results: [] }),
}));
vi.mock("../../src/integrations/vite", () => ({
  optimizeViteOutputDirectory: hoisted.optimize,
}));

import { squeezitAstro } from "../../src/integrations/astro";

describe("astro integration", () => {
  test("delegates final static output to Vite once after all environments finish", async () => {
    const integration = squeezitAstro({ checkDependencies: false });
    const updateConfig = vi.fn();
    const warn = vi.fn();

    expect(integration.name).toBe("squeezit:astro");
    expect(typeof integration.hooks["astro:config:setup"]).toBe("function");

    integration.hooks["astro:config:setup"]?.({
      command: "build",
      isRestart: false,
      config: {
        output: "static",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn } as never,
    });

    expect(warn).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
    hoisted.optimize.mockClear();
    await integration.hooks["astro:build:done"]?.({
      dir: new URL("file:///tmp/astro-output/"),
      pages: [],
      routes: [],
      logger: {},
    } as never);
    await integration.hooks["astro:build:done"]?.({
      dir: new URL("file:///tmp/astro-output/"),
      pages: [],
      routes: [],
      logger: {},
    } as never);
    expect(hoisted.optimize).toHaveBeenCalledTimes(1);
    expect(hoisted.optimize).toHaveBeenCalledWith("/tmp/astro-output/", {
      checkDependencies: false,
    });
  });

  test("skips non-build commands", () => {
    const integration = squeezitAstro();
    const updateConfig = vi.fn();

    integration.hooks["astro:config:setup"]?.({
      command: "dev",
      isRestart: false,
      config: {
        output: "static",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn: vi.fn() } as never,
    });

    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("warns and skips server output", () => {
    const integration = squeezitAstro();
    const updateConfig = vi.fn();
    const warn = vi.fn();

    integration.hooks["astro:config:setup"]?.({
      command: "build",
      isRestart: false,
      config: {
        output: "server",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn } as never,
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("only static Astro builds are supported")
    );
    expect(updateConfig).not.toHaveBeenCalled();
  });
  test("disabled builds do not invoke the Vite output optimizer", async () => {
    hoisted.optimize.mockClear();
    const integration = squeezitAstro({ enabled: false });
    integration.hooks["astro:config:setup"]?.({
      command: "build",
      config: { output: "static" },
      logger: { warn: vi.fn() },
    } as never);
    await integration.hooks["astro:build:done"]?.({
      dir: new URL("file:///tmp/out/"),
    } as never);
    expect(hoisted.optimize).not.toHaveBeenCalled();
  });

  test("reports native optimization failures with PDF paths", async () => {
    hoisted.optimize.mockResolvedValueOnce({
      results: [
        {
          status: "failed",
          filePath: "document.pdf",
          message: "QPDF is unavailable",
        },
      ],
    });
    const integration = squeezitAstro();
    integration.hooks["astro:config:setup"]?.({
      command: "build",
      config: { output: "static" },
      logger: { warn: vi.fn() },
    } as never);
    await expect(
      integration.hooks["astro:build:done"]?.({
        dir: new URL("file:///tmp/out/"),
      } as never)
    ).rejects.toThrow("document.pdf: QPDF is unavailable");
  });
});
