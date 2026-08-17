import { Flags } from "@oclif/core";

import {
  DEPENDENCY_CATALOG,
  detectPlatform,
  diagnoseDependencies,
  readInstallerConfig,
} from "../../utils";
import { SqueezitCommand } from "../base-command";
import { inspectSqueezitInstallations } from "../installations";

export default class Doctor extends SqueezitCommand {
  static override description =
    "Check runtime, platform, update source, and optimizer readiness.";

  static override flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Print diagnostic details to stderr.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(Doctor);
    this.phaseStarted("environment-inspection");
    const [platform, tools, installer, installation] = await Promise.all([
      detectPlatform(),
      diagnoseDependencies(
        Object.keys(DEPENDENCY_CATALOG) as Array<
          keyof typeof DEPENDENCY_CATALOG
        >
      ),
      readInstallerConfig(),
      inspectSqueezitInstallations({
        activePackageRoot: this.config.root,
        activeVersion: this.config.version,
      }),
    ]);
    this.phaseCompleted("environment-inspection", { tools: tools.length });
    const nodeVersion = process.versions.node;
    const runtimeHealthy = compareNodeVersion(nodeVersion, "22.13.0") >= 0;
    const toolsHealthy = tools.every((tool) => tool.status === "healthy");
    const ok = Boolean(platform) && runtimeHealthy && toolsHealthy;
    const data = {
      runtime: {
        node: nodeVersion,
        minimum: "22.13.0",
        healthy: runtimeHealthy,
      },
      platform: { detected: platform, supported: Boolean(platform) },
      update: {
        packageManager:
          installer?.packageManager ??
          (process.versions.bun
            ? "bun"
            : process.env.npm_execpath?.includes("npm")
              ? "npm"
              : null),
        configured: Boolean(installer),
      },
      installation,
      tools,
      ...(flags.verbose
        ? {
            diagnostics: [
              `Checked ${tools.length} tool(s) and runtime readiness.`,
            ],
          }
        : {}),
    };

    process.exitCode = ok ? 0 : 1;
    if (this.jsonEnabled()) {
      return this.emitStatus("doctor", ok, data);
    }

    this.log(
      `Node ${nodeVersion} — ${runtimeHealthy ? "healthy" : "requires >=22.13.0"}`
    );
    this.log(`Platform ${platform ?? "unsupported"}`);
    this.log(
      `${tools.filter((tool) => tool.status === "healthy").length}/${tools.length} optimizer tools healthy`
    );
    for (const warning of installation.warnings) {
      this.log(`⚠ ${warning.message}`);
    }
    if (flags.verbose) {
      this.logToStderr(
        `Checked ${tools.length} tool(s) and runtime readiness.`
      );
    }
    return data;
  }
}

function compareNodeVersion(actual: string, minimum: string): number {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
