import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import {
  optimizeViteOutputDirectory,
  type SqueezitVitePluginOptions,
} from "./vite";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SqueezitAstroOptions extends SqueezitVitePluginOptions {}

export function squeezitAstro(
  options: SqueezitAstroOptions = {}
): AstroIntegration {
  let eligibleBuild = false;
  return {
    name: "squeezit:astro",
    hooks: {
      "astro:config:setup"({ command, config, logger }) {
        eligibleBuild = false;
        if (command !== "build" || options.enabled === false) return;
        if (config.output === "server") {
          logger.warn(
            "[squeezit:astro] Skipping optimization because only static Astro builds are supported."
          );
          return;
        }
        eligibleBuild = true;
      },
      async "astro:build:done"({ dir }) {
        if (!eligibleBuild) return;
        eligibleBuild = false;
        // Astro's Vite environments can finish before final static assets are
        // copied. Delegate once after Astro has completed its output instead.
        const run = await optimizeViteOutputDirectory(
          fileURLToPath(dir),
          options
        );
        const failures = run.results.filter(
          (result) => result.status === "failed"
        );
        if (failures.length) {
          throw new Error(
            `squeezit astro optimization failed:\n${failures.map((result) => `${result.filePath}: ${result.message ?? "unknown error"}`).join("\n")}`
          );
        }
      },
    },
  };
}

export default squeezitAstro;
