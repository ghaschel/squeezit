import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { inspectSqueezitInstallations } from "../../src/cli/installations";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("Squeezit installation inspection", () => {
  test("warns when the active binary is older than another PATH installation", async () => {
    const directory = await createTemporaryDirectory();
    const older = await createSqueezitPackage(directory, "older", "1.0.1");
    const newer = await createSqueezitPackage(directory, "newer", "2.0.7");
    const firstBin = await createBinDirectory(directory, "first", "sqz", older);
    const secondBin = await createBinDirectory(
      directory,
      "second",
      "sqz",
      newer
    );

    const inspection = await inspectSqueezitInstallations({
      activePackageRoot: older.packageRoot,
      activeVersion: "1.0.1",
      path: `${firstBin}:${secondBin}`,
    });

    expect(inspection).toMatchObject({
      candidates: [
        {
          binary: "sqz",
          packageRoot: older.packageRoot,
          path: join(firstBin, "sqz"),
          version: "1.0.1",
        },
        {
          binary: "sqz",
          packageRoot: newer.packageRoot,
          path: join(secondBin, "sqz"),
          version: "2.0.7",
        },
      ],
      status: "warning",
      warnings: [
        {
          code: "STALE_INSTALLATION",
          details: {
            activeVersion: "1.0.1",
            newerVersion: "2.0.7",
          },
        },
      ],
    });
    expect(inspection.duplicates).toEqual([
      {
        binary: "sqz",
        paths: [join(firstBin, "sqz"), join(secondBin, "sqz")],
      },
    ]);
  });

  test("warns when PATH resolves sqz before the active installation", async () => {
    const directory = await createTemporaryDirectory();
    const shadowing = await createSqueezitPackage(
      directory,
      "shadowing",
      "2.0.7"
    );
    const active = await createSqueezitPackage(directory, "active", "2.0.7");
    const firstBin = await createBinDirectory(
      directory,
      "first",
      "sqz",
      shadowing
    );
    const secondBin = await createBinDirectory(
      directory,
      "second",
      "sqz",
      active
    );

    const inspection = await inspectSqueezitInstallations({
      activePackageRoot: active.packageRoot,
      activeVersion: "2.0.7",
      path: `${firstBin}:${secondBin}`,
    });

    expect(inspection.status).toBe("warning");
    expect(inspection.warnings).toContainEqual(
      expect.objectContaining({
        code: "SHADOWED_INSTALLATION",
        details: expect.objectContaining({
          binary: "sqz",
          shadowingPath: join(firstBin, "sqz"),
        }),
      })
    );
  });

  test("records manual and unresolvable candidates without executing them", async () => {
    const directory = await createTemporaryDirectory();
    const active = await createSqueezitPackage(directory, "active", "2.0.7");
    const binDirectory = join(directory, "manual", "bin");
    const manualBinary = join(binDirectory, "sqz");
    const brokenAlias = join(binDirectory, "squeezit");
    await mkdir(binDirectory, { recursive: true });
    await writeFile(manualBinary, "not an executable Squeezit package");
    await symlink(join(directory, "missing", "run.js"), brokenAlias);
    const resolvedManualBinary = await realpath(manualBinary);

    const inspection = await inspectSqueezitInstallations({
      activePackageRoot: active.packageRoot,
      activeVersion: "2.0.7",
      path: binDirectory,
    });

    expect(inspection).toMatchObject({
      candidates: [
        {
          binary: "sqz",
          path: manualBinary,
          resolvedPath: resolvedManualBinary,
        },
        {
          binary: "squeezit",
          path: brokenAlias,
          resolvedPath: brokenAlias,
        },
      ],
      duplicates: [],
      status: "healthy",
      warnings: [],
    });
    expect(inspection.candidates).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ packageRoot: expect.any(String) }),
      ])
    );
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-installations-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createSqueezitPackage(
  directory: string,
  name: string,
  version: string
): Promise<{ packageRoot: string; runPath: string }> {
  const packageRoot = join(directory, name, "node_modules", "squeezit");
  const runPath = join(packageRoot, "bin", "run.js");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await Promise.all([
    writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({ name: "squeezit", version })
    ),
    writeFile(runPath, "#!/usr/bin/env node\n"),
  ]);
  return { packageRoot: await realpath(packageRoot), runPath };
}

async function createBinDirectory(
  directory: string,
  name: string,
  binary: "sqz" | "squeezit",
  installation: { runPath: string }
): Promise<string> {
  const binDirectory = join(directory, name, "bin");
  await mkdir(binDirectory, { recursive: true });
  await symlink(installation.runPath, join(binDirectory, binary));
  return binDirectory;
}
