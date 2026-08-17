import { lstat, readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";

import type { SqueezitIssue } from "./output";

const BINARY_NAMES = ["sqz", "squeezit"] as const;

type SqueezitBinaryName = (typeof BINARY_NAMES)[number];

export interface SqueezitInstallationCandidate {
  binary: SqueezitBinaryName;
  packageRoot?: string;
  path: string;
  resolvedPath: string;
  version?: string;
}

export interface SqueezitInstallationInspection {
  candidates: SqueezitInstallationCandidate[];
  duplicates: Array<{ binary: SqueezitBinaryName; paths: string[] }>;
  status: "healthy" | "warning";
  warnings: SqueezitIssue[];
}

export async function inspectSqueezitInstallations(options: {
  activePackageRoot: string;
  activeVersion: string;
  path?: string;
}): Promise<SqueezitInstallationInspection> {
  const activePackageRoot = await resolvePath(options.activePackageRoot);
  const candidates = await collectCandidates(options.path ?? process.env.PATH);
  const duplicates = BINARY_NAMES.flatMap((binary) => {
    const paths = candidates
      .filter((candidate) => candidate.binary === binary)
      .map((candidate) => candidate.path);
    return paths.length > 1 ? [{ binary, paths }] : [];
  });
  const warnings = [
    ...findStaleInstallationWarnings(
      candidates,
      activePackageRoot,
      options.activeVersion
    ),
    ...findShadowedInstallationWarnings(candidates, activePackageRoot),
  ];

  return {
    candidates,
    duplicates,
    status: warnings.length > 0 ? "warning" : "healthy",
    warnings,
  };
}

async function collectCandidates(
  pathValue: string | undefined
): Promise<SqueezitInstallationCandidate[]> {
  const directories = (pathValue ?? "")
    .split(delimiter)
    .map((entry) => resolve(entry || process.cwd()));
  const candidates: SqueezitInstallationCandidate[] = [];

  for (const directory of directories) {
    for (const binary of BINARY_NAMES) {
      const path = resolve(directory, binary);
      const stats = await lstat(path).catch(() => null);
      if (!stats || (!stats.isFile() && !stats.isSymbolicLink())) continue;

      const resolvedPath = await resolvePath(path);
      const installation = await findSqueezitPackage(dirname(resolvedPath));
      candidates.push({
        binary,
        path,
        resolvedPath,
        ...(installation ? installation : {}),
      });
    }
  }

  return candidates;
}

function findStaleInstallationWarnings(
  candidates: SqueezitInstallationCandidate[],
  activePackageRoot: string,
  activeVersion: string
): SqueezitIssue[] {
  const newer = candidates
    .filter(
      (candidate) =>
        candidate.packageRoot !== activePackageRoot &&
        candidate.version &&
        compareVersions(candidate.version, activeVersion) > 0
    )
    .sort((left, right) =>
      compareVersions(right.version ?? "0.0.0", left.version ?? "0.0.0")
    )[0];

  if (!newer?.version) return [];

  return [
    {
      code: "STALE_INSTALLATION",
      details: {
        activePackageRoot,
        activeVersion,
        newerPath: newer.path,
        newerVersion: newer.version,
      },
      message: `The active Squeezit installation (${activeVersion}) is older than ${newer.path} (${newer.version}).`,
      remediation:
        "Update or remove the older installation, then verify the active binary with sqz version --json.",
    },
  ];
}

function findShadowedInstallationWarnings(
  candidates: SqueezitInstallationCandidate[],
  activePackageRoot: string
): SqueezitIssue[] {
  return BINARY_NAMES.flatMap((binary) => {
    const first = candidates.find((candidate) => candidate.binary === binary);
    if (!first?.packageRoot || first.packageRoot === activePackageRoot) {
      return [];
    }

    return [
      {
        code: "SHADOWED_INSTALLATION",
        details: {
          activePackageRoot,
          binary,
          shadowingPath: first.path,
          shadowingVersion: first.version ?? null,
        },
        message: `${first.path} appears before the active Squeezit installation on PATH.`,
        remediation:
          "Move the intended Squeezit installation earlier on PATH or remove the shadowing installation.",
      },
    ];
  });
}

async function findSqueezitPackage(
  startingDirectory: string
): Promise<{ packageRoot: string; version: string } | undefined> {
  let directory = startingDirectory;

  while (true) {
    const packageJsonPath = resolve(directory, "package.json");
    const metadata = await readPackageJson(packageJsonPath);
    if (metadata?.name === "squeezit" && typeof metadata.version === "string") {
      return { packageRoot: directory, version: metadata.version };
    }

    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

async function readPackageJson(
  path: string
): Promise<{ name?: unknown; version?: unknown } | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
  } catch {
    return undefined;
  }
}

async function resolvePath(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function versionParts(version: string): number[] {
  const coreVersion = version.replace(/^v/i, "").split("-", 1)[0] ?? "0";

  return coreVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
