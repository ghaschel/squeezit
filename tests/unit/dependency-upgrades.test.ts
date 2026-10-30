import { describe, expect, test } from "vitest";

import {
  DEPENDENCY_CATALOG,
  type DependencyDiagnostic,
  type DependencyName,
} from "../../src/core/dependencies";
import {
  assessDependencyUpgradeTargets,
  executeDependencyUpgradePlan,
  inspectDependencyUpgrades,
  planDependencyUpgrades,
} from "../../src/core/dependency-upgrades";

function tool(binary: DependencyName, version?: string): DependencyDiagnostic {
  return {
    binary,
    minimumVersion: DEPENDENCY_CATALOG[binary].minimumVersion,
    present: Boolean(version),
    provider: "manual",
    status: version ? "healthy" : "missing",
    normalizedVersion: version,
    remediation: "",
  };
}

const result = (stdout = "", exitCode = 0) => ({
  stdout,
  stderr: "",
  all: stdout,
  exitCode,
});

describe("dependency upgrade targets", () => {
  test("requires the refreshed target even when the compatibility floor is satisfied", () => {
    expect(
      assessDependencyUpgradeTargets([tool("qpdf", "11.3.0")])[0]
    ).toMatchObject({
      minimumVersion: "11.3.0",
      targetVersion: "12.4.2",
      targetStatus: "outdated",
    });
  });

  test("retains newer versions and ignores Homebrew packaging revisions", () => {
    const tools = assessDependencyUpgradeTargets([
      tool("qpdf", "12.5.0"),
      tool("zopflipng", "1.0.3_1"),
      tool("cjxl", "0.12.0"),
      tool("magick", "7.1.2-9"),
    ]);
    expect(tools.map((t) => t.targetStatus)).toEqual([
      "current",
      "current",
      "current",
      "outdated",
    ]);
    expect(tools[3]?.targetVersion).toBe("7.1.2-34");
  });

  test("covers every catalog binary and shared source group", () => {
    const tools = assessDependencyUpgradeTargets(
      Object.keys(DEPENDENCY_CATALOG).map((name) =>
        tool(name as DependencyName)
      )
    );
    expect(tools).toHaveLength(24);
    expect(
      tools.every((t) => t.targetVersion && t.targetStatus === "missing")
    ).toBe(true);
    expect(tools.find((t) => t.binary === "file")?.targetVersion).toBe("5.41");
    expect(
      tools
        .filter((t) => ["avifenc", "avifdec"].includes(t.binary))
        .map((t) => t.targetVersion)
    ).toEqual(["1.4.2", "1.4.2"]);
  });

  test("does not accept absent or unverifiable versions", () => {
    expect(
      assessDependencyUpgradeTargets([
        tool("qpdf"),
        { ...tool("qpdf", "12.4.2"), status: "unverifiable" },
        tool("qpdf", "not-a-version"),
      ]).map((t) => t.targetStatus)
    ).toEqual(["missing", "unverifiable", "unverifiable"]);
  });
});

describe("scoped dependency upgrades", () => {
  test("does not accept a package receipt when a self-reporting binary cannot report its version", async () => {
    const tools = await inspectDependencyUpgrades([DEPENDENCY_CATALOG.qpdf], {
      platform: "macos",
      commandExists: async () => true,
      providerVersionLookup: async () => ({
        provider: "brew",
        rawVersion: "12.4.2",
      }),
      runCommand: async () => result("cannot start executable", 1),
    });
    expect(tools[0]?.targetStatus).toBe("unverifiable");
  });

  test("rejects numeric version paths in failed executable launch output", async () => {
    const tools = await inspectDependencyUpgrades([DEPENDENCY_CATALOG.qpdf], {
      platform: "macos",
      commandExists: async () => true,
      providerVersionLookup: async () => ({
        provider: "brew",
        rawVersion: "12.4.2",
      }),
      runCommand: async () =>
        result(
          "dyld: Library not loaded, referenced from /opt/homebrew/Cellar/qpdf/12.4.2/bin/qpdf",
          134
        ),
    });
    expect(tools[0]?.targetStatus).toBe("unverifiable");
  });

  test.each([
    ["1.0.2", "1.0.3_1", "current"],
    ["1.0.3_1", "1.0.2", "outdated"],
  ])(
    "uses the selected Zopfli keg rather than the first installed version %s",
    async (first, selected, expected) => {
      const prefix = `/brew/Cellar/zopfli/${selected}`;
      const tools = await inspectDependencyUpgrades(
        [DEPENDENCY_CATALOG.zopflipng],
        {
          platform: "macos",
          commandExists: async () => true,
          providerVersionLookup: async () => ({
            provider: "brew",
            rawVersion: first,
          }),
          realpath: async (path) => path.replace("/brew/opt/zopfli", prefix),
          runCommand: async (command) =>
            command === "which"
              ? result(`${prefix}/bin/zopflipng`)
              : command === "brew"
                ? result("/brew/opt/zopfli")
                : result("Unknown flag: --version"),
        }
      );
      expect(tools[0]?.targetStatus).toBe(expected);
      expect(tools[0]?.normalizedVersion).toBe(selected.replace(/_\d+$/, ""));
      if (expected === "current") {
        const plan = await planDependencyUpgrades("macos", tools, {
          runCommand: async () => {
            throw new Error("unnecessary upgrade");
          },
        });
        expect(plan.commands).toEqual([]);
      }
    }
  );

  test("requires MozJPEG identity for an explicitly selected jpegtran", async () => {
    const tools = await inspectDependencyUpgrades(
      [DEPENDENCY_CATALOG.jpegtran],
      {
        platform: "macos",
        resolveMozjpegBinary: async () => "/custom/jpegtran",
        providerVersionLookup: async () => ({
          provider: "brew",
          rawVersion: "4.1.5",
        }),
        runCommand: async () => result("libjpeg-turbo version 4.1.5"),
      }
    );
    expect(tools[0]?.targetStatus).toBe("unverifiable");
  });

  test.each([true, false])(
    "binds provider-only version receipts to the selected binary (owned=%s)",
    async (owned) => {
      const tools = await inspectDependencyUpgrades(
        [DEPENDENCY_CATALOG.zopflipng],
        {
          platform: "macos",
          commandExists: async () => true,
          providerVersionLookup: async () => ({
            provider: "brew",
            rawVersion: "1.0.3_1",
          }),
          realpath: async (path) =>
            path.replace("/brew/opt/zopfli", "/brew/Cellar/zopfli/1.0.3_1"),
          runCommand: async (command) => {
            if (command === "which")
              return result(
                owned ? "/brew/opt/zopfli/bin/zopflipng" : "/old/bin/zopflipng"
              );
            if (command === "brew") return result("/brew/opt/zopfli");
            return result("");
          },
        }
      );
      expect(tools[0]?.targetStatus).toBe(owned ? "current" : "unverifiable");
    }
  );

  test("disables sudo prompting for machine-readable upgrades", async () => {
    const plan = await planDependencyUpgrades(
      "debian",
      assessDependencyUpgradeTargets([tool("qpdf")]),
      { nonInteractive: true }
    );
    expect(
      plan.commands.every(
        (command) => command.command === "sudo" && command.args[0] === "-n"
      )
    ).toBe(true);
  });

  test("deduplicates shared Homebrew packages and separates installs from upgrades", async () => {
    const plan = await planDependencyUpgrades(
      "macos",
      assessDependencyUpgradeTargets([
        tool("cwebp", "1.5.0"),
        tool("dwebp"),
        tool("qpdf"),
        tool("file", "5.41"),
      ]),
      {
        runCommand: async (_command, args) =>
          args.at(-1) === "webp" ? result("webp 1.5.0\n") : result("", 1),
      }
    );
    expect(plan.commands).toEqual([
      { command: "brew", args: ["upgrade", "--formula", "--no-ask", "webp"] },
      { command: "brew", args: ["install", "--formula", "--no-ask", "qpdf"] },
    ]);
    expect(plan.blocked).toEqual([]);
  });

  test("does not run a package manager when targets are already met", async () => {
    const plan = await planDependencyUpgrades(
      "macos",
      assessDependencyUpgradeTargets([
        tool("qpdf", "12.4.2"),
        tool("oxipng", "11.0.0"),
      ]),
      {
        runCommand: async () => {
          throw new Error(
            "must not inspect provider updates when targets are met"
          );
        },
      }
    );
    expect(plan.commands).toEqual([]);
  });

  test("uses only named APT packages and pinned Cargo targets on Debian", async () => {
    const plan = await planDependencyUpgrades(
      "debian",
      assessDependencyUpgradeTargets([
        tool("qpdf", "11.3.0"),
        tool("oxipng", "10.1.0"),
        tool("jpegoptim", "1.5.5"),
      ])
    );
    expect(plan.commands).toEqual([
      { command: "sudo", args: ["apt-get", "update"] },
      {
        command: "sudo",
        args: ["apt-get", "install", "--yes", "--no-remove", "qpdf"],
      },
      {
        command: "cargo",
        args: ["install", "oxipng", "--version", "10.2.1", "--locked"],
      },
    ]);
    expect(plan.blocked.map((t) => t.binary)).toEqual(["jpegoptim"]);
    expect(plan.blocked[0]?.remediation).toContain("1.5.6");
  });

  test("reports macOS system tools without trying to replace them", async () => {
    const plan = await planDependencyUpgrades(
      "macos",
      assessDependencyUpgradeTargets([tool("file", "5.39")])
    );
    expect(plan.commands).toEqual([]);
    expect(plan.blocked[0]?.remediation).toContain("macOS");
  });

  test("fails verification when an apparently successful upgrade leaves an old executable", async () => {
    const before = assessDependencyUpgradeTargets([tool("qpdf", "11.3.0")]);
    const plan = await planDependencyUpgrades("macos", before, {
      runCommand: async () => result("qpdf 11.3.0"),
    });
    const execution = await executeDependencyUpgradePlan(plan, {
      runCommand: async () => result("Already up-to-date"),
      inspect: async () => before,
    });
    expect(execution.ok).toBe(false);
    expect(execution.toolsAfter[0]?.targetStatus).toBe("outdated");
  });

  test("reports successful upgrades only after verifying their target versions", async () => {
    const plan = await planDependencyUpgrades(
      "macos",
      assessDependencyUpgradeTargets([tool("qpdf")]),
      { runCommand: async () => result("", 1) }
    );
    const execution = await executeDependencyUpgradePlan(plan, {
      runCommand: async () => result("installer output"),
      inspect: async () =>
        assessDependencyUpgradeTargets([tool("qpdf", "12.4.2")]),
    });
    expect(execution.ok).toBe(true);
    expect(execution.executed).toHaveLength(1);
    expect(execution.executed[0]?.output).toBe("installer output");
  });

  test("stops on installer failure but still inspects the resulting environment", async () => {
    const plan = {
      commands: [
        { command: "brew", args: ["upgrade", "qpdf"] },
        { command: "brew", args: ["install", "webp"] },
      ],
      blocked: [],
    };
    const calls: string[] = [];
    const execution = await executeDependencyUpgradePlan(plan, {
      runCommand: async () => {
        calls.push("install");
        throw new Error("permission denied");
      },
      inspect: async () => {
        calls.push("inspect");
        return assessDependencyUpgradeTargets([tool("qpdf")]);
      },
    });
    expect(calls).toEqual(["install", "inspect"]);
    expect(execution.ok).toBe(false);
    expect(execution.executed[0]?.error).toContain("permission denied");
  });
});
