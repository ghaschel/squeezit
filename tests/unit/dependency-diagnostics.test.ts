import { describe, expect, test } from "vitest";

import {
  compareDependencyVersions,
  DEPENDENCY_CATALOG,
  diagnoseDependency,
  normalizeDependencyVersion,
} from "../../src/core";
import { diagnoseDependency as diagnoseDependencyFromUtils } from "../../src/utils";

describe("dependency catalog diagnostics", () => {
  test("re-exports diagnostics through the utility barrel", () => {
    expect(diagnoseDependencyFromUtils).toBe(diagnoseDependency);
  });

  test("uses system file on macOS and the linked jpeg-turbo provider", () => {
    expect(DEPENDENCY_CATALOG.file.brewPackage).toBeUndefined();
    expect(DEPENDENCY_CATALOG.file.systemProvided).toBe(true);
    expect(DEPENDENCY_CATALOG.jpegtran.brewPackage).toBe("jpeg-turbo");
    expect(DEPENDENCY_CATALOG.svgo.brewPackage).toBe("svgo");
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

  test("reports a missing binary with its package remediation", async () => {
    const diagnostic = await diagnoseDependency("jpegtran", {
      platform: "macos",
      commandExists: async () => false,
    });

    expect(diagnostic).toMatchObject({
      binary: "jpegtran",
      present: false,
      provider: "unknown",
      status: "missing",
      minimumVersion: "3.1.3",
      remediation: "Install Homebrew package: jpeg-turbo",
    });
  });

  test("uses provider fallback for a present tool that does not self-report a version", async () => {
    const diagnostic = await diagnoseDependency("jpegrescan", {
      platform: "macos",
      commandExists: async () => true,
      runCommand: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "unknown option --version",
        all: "unknown option --version",
      }),
      providerVersionLookup: async () => ({
        provider: "brew",
        rawVersion: "1.1.0_1",
      }),
    });

    expect(diagnostic).toMatchObject({
      present: true,
      provider: "brew",
      rawVersion: "1.1.0_1",
      normalizedVersion: "1.1.0",
      status: "healthy",
    });
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
