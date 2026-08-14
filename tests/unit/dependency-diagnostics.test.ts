import { describe, expect, test } from "vitest";

import {
  buildMissingDependencyMessage,
  compareDependencyVersions,
  DEPENDENCY_CATALOG,
  diagnoseDependency,
  normalizeDependencyVersion,
  resolveMozjpegBinary,
} from "../../src/core";
import { diagnoseDependency as diagnoseDependencyFromUtils } from "../../src/utils";

describe("dependency catalog diagnostics", () => {
  test("re-exports diagnostics through the utility barrel", () => {
    expect(diagnoseDependencyFromUtils).toBe(diagnoseDependency);
  });

  test("uses macOS system file and Homebrew MozJPEG", () => {
    expect(DEPENDENCY_CATALOG.file.brewPackage).toBeUndefined();
    expect(DEPENDENCY_CATALOG.file.systemProvided).toBe(true);
    expect(DEPENDENCY_CATALOG.jpegtran.brewPackage).toBe("mozjpeg");
    expect(DEPENDENCY_CATALOG.jpegtran.aptPackage).toBeUndefined();
    expect(DEPENDENCY_CATALOG.svgo.brewPackage).toBe("svgo");
  });

  test("uses the pinned Cargo fallback for oxipng on Debian and describes it accurately", () => {
    expect(DEPENDENCY_CATALOG.oxipng.aptPackage).toBeUndefined();
    expect(DEPENDENCY_CATALOG.oxipng.cargoPackage).toEqual({
      crate: "oxipng",
      version: "10.1.0",
    });
    expect(
      buildMissingDependencyMessage([DEPENDENCY_CATALOG.oxipng], "debian")
    ).toContain("cargo install oxipng --version 10.1.0 --locked");
  });

  test("uses supported version probe arguments for WebP and TIFF tools", () => {
    expect(DEPENDENCY_CATALOG.cwebp.versionArgs).toEqual(["-version"]);
    expect(DEPENDENCY_CATALOG.dwebp.versionArgs).toEqual(["-version"]);
    expect(DEPENDENCY_CATALOG.webpinfo.versionArgs).toEqual(["-version"]);
    expect(DEPENDENCY_CATALOG.webpmux.versionArgs).toEqual(["-version"]);
    expect(DEPENDENCY_CATALOG.gif2webp.versionArgs).toEqual(["-version"]);
    expect(DEPENDENCY_CATALOG.tiffcp.versionArgs).toEqual(["-h"]);
  });

  test("keeps macOS system tools labelled as system when they self-report", async () => {
    const diagnostic = await diagnoseDependency("file", {
      platform: "macos",
      commandExists: async () => true,
      runCommand: async () => ({
        exitCode: 0,
        stdout: "file-5.41",
        stderr: "",
        all: "file-5.41",
      }),
    });

    expect(diagnostic).toMatchObject({
      provider: "system",
      status: "healthy",
    });
  });

  test("normalizes tool versions without treating package revisions as tool versions", () => {
    expect(normalizeDependencyVersion("libjpeg-turbo version 3.1.3")).toBe(
      "3.1.3"
    );
    expect(normalizeDependencyVersion("zopfli 1.0.3_1")).toBe("1.0.3");
    expect(normalizeDependencyVersion("ImageMagick 7.1.2-9")).toBe("7.1.2-9");
  });

  test("prefers the executable version over a dependency-library version", () => {
    expect(
      normalizeDependencyVersion(
        "png.h version: 1.6.44\n pngcrush 1.8.13, uses libpng 1.6.44",
        "pngcrush"
      )
    ).toBe("1.8.13");
  });

  test("compares normalized numeric tool versions", () => {
    expect(compareDependencyVersions("7.1.2-9", "7.1.2-9")).toBe(0);
    expect(compareDependencyVersions("7.1.2-10", "7.1.2-9")).toBe(1);
    expect(compareDependencyVersions("1.5.5", "1.5.6")).toBe(-1);
  });

  test("reports a missing MozJPEG binary with its package remediation", async () => {
    const diagnostic = await diagnoseDependency("jpegtran", {
      platform: "macos",
      resolveMozjpegBinary: async () => undefined,
    });

    expect(diagnostic).toMatchObject({
      binary: "jpegtran",
      present: false,
      provider: "unknown",
      status: "missing",
      minimumVersion: "4.1.5",
      remediation: "Install Homebrew package: mozjpeg",
    });
  });

  test("resolves MozJPEG through the formula wrapper environment", async () => {
    await expect(
      resolveMozjpegBinary({
        environment: {
          SQUEEZIT_MOZJPEGTRAN: "/opt/homebrew/opt/mozjpeg/bin/jpegtran",
        },
        pathExists: async (path) =>
          path === "/opt/homebrew/opt/mozjpeg/bin/jpegtran",
      })
    ).resolves.toBe("/opt/homebrew/opt/mozjpeg/bin/jpegtran");
  });

  test("resolves a keg-only Homebrew MozJPEG binary when PATH has no jpegtran", async () => {
    await expect(
      resolveMozjpegBinary({
        commandExists: async () => false,
        environment: {},
        pathExists: async (path) =>
          path === "/opt/homebrew/opt/mozjpeg/bin/jpegtran",
        runCommand: async (command, args) => {
          expect([command, args]).toEqual(["brew", ["--prefix", "mozjpeg"]]);
          return {
            exitCode: 0,
            stdout: "/opt/homebrew/opt/mozjpeg\n",
            stderr: "",
            all: "/opt/homebrew/opt/mozjpeg\n",
          };
        },
      })
    ).resolves.toBe("/opt/homebrew/opt/mozjpeg/bin/jpegtran");
  });

  test("rejects a PATH jpegtran that is not MozJPEG", async () => {
    await expect(
      resolveMozjpegBinary({
        commandExists: async () => true,
        environment: {},
        pathExists: async () => false,
        runCommand: async (command, args) => {
          if (command === "jpegtran") {
            expect(args).toEqual(["-version"]);
            return {
              exitCode: 0,
              stdout: "libjpeg-turbo version 3.1.3",
              stderr: "",
              all: "libjpeg-turbo version 3.1.3",
            };
          }

          return { exitCode: 1, stdout: "", stderr: "", all: "" };
        },
      })
    ).resolves.toBeUndefined();
  });

  test("uses the installed formula version when a present MozJPEG binary does not self-report", async () => {
    const diagnostic = await diagnoseDependency("jpegtran", {
      platform: "macos",
      resolveMozjpegBinary: async () =>
        "/opt/homebrew/opt/mozjpeg/bin/jpegtran",
      runCommand: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "unknown option --version",
        all: "unknown option --version",
      }),
      providerVersionLookup: async () => ({
        provider: "brew",
        rawVersion: "4.1.5_1",
      }),
    });

    expect(diagnostic).toMatchObject({
      present: true,
      provider: "brew",
      rawVersion: "4.1.5_1",
      normalizedVersion: "4.1.5",
      status: "healthy",
    });
  });

  test("gives Debian users a manual MozJPEG remediation rather than substituting jpeg-turbo", () => {
    expect(
      buildMissingDependencyMessage([DEPENDENCY_CATALOG.jpegtran], "debian")
    ).toContain(
      "Install MozJPEG and set SQUEEZIT_MOZJPEGTRAN to its jpegtran executable"
    );
  });

  test("marks a manually installed version-unreporting tool as unhealthy", async () => {
    const diagnostic = await diagnoseDependency("zopflipng", {
      platform: null,
      commandExists: async () => true,
      runCommand: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "unknown option --version",
        all: "unknown option --version",
      }),
    });

    expect(diagnostic).toMatchObject({
      present: true,
      provider: "manual",
      status: "unverifiable",
      remediation:
        "Install zopflipng through a supported package manager so its version can be verified",
    });
  });
});
