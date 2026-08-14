import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname } from "node:path";

import type {
  CoreOptimizationOptions,
  DependencySpec,
  ResolvedInput,
} from "../types";
import { commandExists, runCheckedCommand, runCommand } from "../utils/exec";

export type DependencyName =
  | "file"
  | "jpegtran"
  | "jpegrescan"
  | "jpegoptim"
  | "pngcrush"
  | "optipng"
  | "zopflipng"
  | "oxipng"
  | "gifsicle"
  | "svgo"
  | "cwebp"
  | "dwebp"
  | "webpinfo"
  | "webpmux"
  | "gif2webp"
  | "heif-enc"
  | "avifenc"
  | "tiffcp"
  | "magick"
  | "exiftool"
  | "dnglab"
  | "cjxl"
  | "icotool";

export type SupportedPlatform = "macos" | "debian";

export type DependencyProvider =
  | "apt"
  | "brew"
  | "manual"
  | "system"
  | "unknown";

export type DependencyInstaller = "apt" | "brew" | "cargo";

export interface DependencyInstallTarget {
  installer: DependencyInstaller;
  package: string;
  version?: string;
}

export interface DependencyInstallOptions {
  commandExists?: (binary: string) => Promise<boolean>;
  runCheckedCommand?: (
    command: string,
    args: string[],
    options: { stdio: "inherit" }
  ) => Promise<unknown>;
}

export type DependencyHealthStatus =
  | "healthy"
  | "missing"
  | "outdated"
  | "unverifiable";

export interface DependencyDiagnosticSpec extends DependencySpec {
  minimumVersion: string;
  versionArgs: string[];
  versionReporting: "self" | "provider";
}

export interface DependencyProviderVersion {
  provider: Extract<DependencyProvider, "apt" | "brew" | "system">;
  rawVersion: string;
}

export interface DependencyCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  all: string;
}

export type DependencyCommandRunner = (
  command: string,
  args: string[]
) => Promise<DependencyCommandResult>;

export interface DependencyDiagnosticOptions {
  platform?: SupportedPlatform | null;
  commandExists?: (binary: string) => Promise<boolean>;
  runCommand?: DependencyCommandRunner;
  providerVersionLookup?: (
    dependency: DependencyDiagnosticSpec,
    platform: SupportedPlatform
  ) => Promise<DependencyProviderVersion | undefined>;
}

export interface DependencyDiagnostic {
  binary: string;
  present: boolean;
  provider: DependencyProvider;
  status: DependencyHealthStatus;
  minimumVersion: string;
  rawVersion?: string;
  normalizedVersion?: string;
  remediation: string;
}

export const DEPENDENCY_CATALOG: Record<
  DependencyName,
  DependencyDiagnosticSpec
> = {
  file: {
    binary: "file",
    required: true,
    aptPackage: "file",
    systemProvided: true,
    minimumVersion: "5.41",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  jpegtran: {
    binary: "jpegtran",
    required: true,
    brewPackage: "jpeg-turbo",
    aptPackage: "libjpeg-turbo-progs",
    minimumVersion: "3.1.3",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  jpegrescan: {
    binary: "jpegrescan",
    required: true,
    brewPackage: "jpegrescan",
    aptPackage: "jpegrescan",
    minimumVersion: "1.1.0",
    versionArgs: ["--version"],
    versionReporting: "provider",
  },
  jpegoptim: {
    binary: "jpegoptim",
    required: true,
    brewPackage: "jpegoptim",
    aptPackage: "jpegoptim",
    minimumVersion: "1.5.6",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  pngcrush: {
    binary: "pngcrush",
    required: true,
    brewPackage: "pngcrush",
    aptPackage: "pngcrush",
    minimumVersion: "1.8.13",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  optipng: {
    binary: "optipng",
    required: true,
    brewPackage: "optipng",
    aptPackage: "optipng",
    minimumVersion: "7.9.1",
    versionArgs: ["-v"],
    versionReporting: "self",
  },
  zopflipng: {
    binary: "zopflipng",
    required: true,
    brewPackage: "zopfli",
    aptPackage: "zopfli",
    minimumVersion: "1.0.3",
    versionArgs: ["--version"],
    versionReporting: "provider",
  },
  oxipng: {
    binary: "oxipng",
    required: true,
    brewPackage: "oxipng",
    cargoPackage: {
      crate: "oxipng",
      version: "10.1.0",
    },
    minimumVersion: "10.1.0",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  gifsicle: {
    binary: "gifsicle",
    required: true,
    brewPackage: "gifsicle",
    aptPackage: "gifsicle",
    minimumVersion: "1.96",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  svgo: {
    binary: "svgo",
    required: true,
    brewPackage: "svgo",
    aptPackage: "node-svgo",
    minimumVersion: "4.0.1",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  cwebp: {
    binary: "cwebp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
    minimumVersion: "1.6.0",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  dwebp: {
    binary: "dwebp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
    minimumVersion: "1.6.0",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  webpinfo: {
    binary: "webpinfo",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
    minimumVersion: "1.6.0",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  webpmux: {
    binary: "webpmux",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
    minimumVersion: "1.6.0",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  gif2webp: {
    binary: "gif2webp",
    required: true,
    brewPackage: "webp",
    aptPackage: "webp",
    minimumVersion: "1.6.0",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  "heif-enc": {
    binary: "heif-enc",
    required: true,
    brewPackage: "libheif",
    aptPackage: "libheif-examples",
    minimumVersion: "1.20.2",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  avifenc: {
    binary: "avifenc",
    required: true,
    brewPackage: "libavif",
    aptPackage: "libavif-bin",
    minimumVersion: "1.4.0",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  tiffcp: {
    binary: "tiffcp",
    required: true,
    brewPackage: "libtiff",
    aptPackage: "libtiff-tools",
    minimumVersion: "4.7.1",
    versionArgs: ["-h"],
    versionReporting: "self",
  },
  magick: {
    binary: "magick",
    required: true,
    brewPackage: "imagemagick",
    aptPackage: "imagemagick",
    minimumVersion: "7.1.2-9",
    versionArgs: ["-version"],
    versionReporting: "self",
  },
  exiftool: {
    binary: "exiftool",
    required: true,
    brewPackage: "exiftool",
    aptPackage: "libimage-exiftool-perl",
    minimumVersion: "13.50",
    versionArgs: ["-ver"],
    versionReporting: "self",
  },
  dnglab: {
    binary: "dnglab",
    required: true,
    brewPackage: "dnglab",
    aptPackage: "dnglab",
    minimumVersion: "0.7.2",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  cjxl: {
    binary: "cjxl",
    required: true,
    brewPackage: "jpeg-xl",
    aptPackage: "libjxl-tools",
    minimumVersion: "0.11.2",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
  icotool: {
    binary: "icotool",
    required: true,
    brewPackage: "icoutils",
    aptPackage: "icoutils",
    minimumVersion: "0.32.3",
    versionArgs: ["--version"],
    versionReporting: "self",
  },
};

/**
 * Returns a tool version suitable for compatibility comparison. Homebrew's
 * formula revision suffix (`_1`) is intentionally omitted because it does not
 * describe the binary's upstream compatibility level.
 */
export function normalizeDependencyVersion(
  output: string,
  binary?: string
): string | undefined {
  if (binary) {
    const escapedBinary = binary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namedMatch = output.match(
      new RegExp(
        `${escapedBinary}\\s+(?:version\\s+)?v?(\\d+(?:\\.\\d+)+(?:-\\d+)?(?:_\\d+)?)`,
        "i"
      )
    );
    if (namedMatch?.[1]) {
      return namedMatch[1].replace(/_\d+$/, "");
    }
  }

  const match = output.match(/\d+(?:\.\d+)+(?:-\d+)?(?:_\d+)?/);
  return match?.[0].replace(/_\d+$/, "");
}

export function compareDependencyVersions(
  actual: string,
  minimum: string
): -1 | 0 | 1 {
  const actualParts = versionParts(actual);
  const minimumParts = versionParts(minimum);
  const length = Math.max(actualParts.length, minimumParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }

  return 0;
}

export async function diagnoseDependency(
  name: DependencyName,
  options: DependencyDiagnosticOptions = {}
): Promise<DependencyDiagnostic> {
  const dependency = DEPENDENCY_CATALOG[name];
  const platform = options.platform ?? (await detectPlatform());
  const exists = options.commandExists ?? commandExists;

  if (!(await exists(dependency.binary))) {
    return {
      binary: dependency.binary,
      present: false,
      provider: "unknown",
      status: "missing",
      minimumVersion: dependency.minimumVersion,
      remediation: remediationFor(dependency, platform),
    };
  }

  const commandRunner = options.runCommand ?? runCommand;
  const providerVersion = platform
    ? options.providerVersionLookup
      ? await options.providerVersionLookup(dependency, platform)
      : await lookupProviderVersion(dependency, platform, commandRunner)
    : undefined;
  const provider =
    providerVersion?.provider ?? providerFor(dependency, platform);
  const probe = await commandRunner(dependency.binary, dependency.versionArgs);
  const directVersion =
    dependency.versionReporting === "self"
      ? normalizeDependencyVersion(probe.all, dependency.binary)
      : undefined;

  if (directVersion) {
    return diagnosticForVersion(
      dependency,
      provider,
      directVersion,
      directVersion,
      platform
    );
  }

  if (providerVersion) {
    const normalizedVersion = normalizeDependencyVersion(
      providerVersion.rawVersion
    );
    if (normalizedVersion) {
      return diagnosticForVersion(
        dependency,
        providerVersion.provider,
        providerVersion.rawVersion,
        normalizedVersion,
        platform
      );
    }
  }

  return {
    binary: dependency.binary,
    present: true,
    provider,
    status: "unverifiable",
    minimumVersion: dependency.minimumVersion,
    remediation: `Install ${dependency.binary} through a supported package manager so its version can be verified`,
  };
}

function providerFor(
  dependency: DependencyDiagnosticSpec,
  platform: SupportedPlatform | null
): DependencyProvider {
  return dependency.systemProvided && platform === "macos"
    ? "system"
    : "manual";
}

export async function diagnoseDependencies(
  dependencies: Array<DependencyName | DependencySpec>,
  options: DependencyDiagnosticOptions = {}
): Promise<DependencyDiagnostic[]> {
  const names = dependencies.map((dependency) =>
    typeof dependency === "string"
      ? dependency
      : (dependency.binary as DependencyName)
  );
  return Promise.all(names.map((name) => diagnoseDependency(name, options)));
}

async function lookupProviderVersion(
  dependency: DependencyDiagnosticSpec,
  platform: SupportedPlatform | null,
  commandRunner: DependencyCommandRunner
): Promise<DependencyProviderVersion | undefined> {
  if (platform === "macos" && dependency.brewPackage) {
    const result = await commandRunner("brew", [
      "list",
      "--versions",
      "--formula",
      dependency.brewPackage,
    ]);
    const rawVersion = packageVersionFromOutput(
      result.all,
      dependency.brewPackage
    );
    return rawVersion ? { provider: "brew", rawVersion } : undefined;
  }

  if (platform === "debian" && dependency.aptPackage) {
    const result = await commandRunner("dpkg-query", [
      "-W",
      "-f=${Version}",
      dependency.aptPackage,
    ]);
    const rawVersion = result.all.trim();
    return result.exitCode === 0 && rawVersion
      ? { provider: "apt", rawVersion }
      : undefined;
  }

  return undefined;
}

function diagnosticForVersion(
  dependency: DependencyDiagnosticSpec,
  provider: DependencyProvider,
  rawVersion: string,
  normalizedVersion: string,
  platform: SupportedPlatform | null
): DependencyDiagnostic {
  const healthy =
    compareDependencyVersions(normalizedVersion, dependency.minimumVersion) >=
    0;

  return {
    binary: dependency.binary,
    present: true,
    provider,
    status: healthy ? "healthy" : "outdated",
    minimumVersion: dependency.minimumVersion,
    rawVersion,
    normalizedVersion,
    remediation: healthy
      ? ""
      : `Upgrade ${remediationFor(dependency, platform)}`,
  };
}

function remediationFor(
  dependency: DependencyDiagnosticSpec,
  platform: SupportedPlatform | null
): string {
  if (platform === "macos" && dependency.brewPackage) {
    return `Install Homebrew package: ${dependency.brewPackage}`;
  }

  if (platform === "debian" && dependency.aptPackage) {
    return `Install APT package: ${dependency.aptPackage}`;
  }

  if (platform === "debian" && dependency.cargoPackage) {
    return `Install with Cargo: cargo install ${dependency.cargoPackage.crate} --version ${dependency.cargoPackage.version} --locked`;
  }

  if (dependency.systemProvided && platform === "macos") {
    return `${dependency.binary} should be provided by macOS`;
  }

  return `Install required tool: ${dependency.binary}`;
}

function packageVersionFromOutput(
  output: string,
  packageName: string
): string | undefined {
  const packageLine = output
    .split("\n")
    .find((line) => line.trim().startsWith(`${packageName} `));
  return packageLine?.trim().slice(packageName.length).trim();
}

function versionParts(version: string): number[] {
  return version
    .replace(/_\d+$/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10));
}

const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
]);

const FORMAT_DEPENDENCIES: Record<string, DependencyName[]> = {
  jpeg: ["jpegtran", "jpegrescan", "jpegoptim"],
  png: ["pngcrush", "optipng", "oxipng"],
  apng: ["oxipng"],
  gif: ["gifsicle"],
  webp: ["cwebp", "dwebp", "webpinfo", "webpmux", "magick"],
  svg: ["svgo"],
  tiff: ["tiffcp"],
  heif: ["magick", "heif-enc"],
  avif: ["magick", "avifenc"],
  bmp: ["magick"],
  jxl: ["cjxl"],
  ico: ["icotool", "oxipng", "exiftool"],
  cur: ["icotool", "oxipng", "exiftool"],
  raw: [],
};

const STRIP_METADATA_FORMATS = new Set([
  "png",
  "apng",
  "gif",
  "webp",
  "tiff",
  "heif",
  "avif",
  "jxl",
  "raw",
]);

export function collectRequiredDependencies(
  inputs: ResolvedInput[],
  options: CoreOptimizationOptions,
  installAllWhenEmpty = false
): DependencySpec[] {
  if (inputs.length === 0) {
    return installAllWhenEmpty
      ? Object.values(DEPENDENCY_CATALOG)
      : [DEPENDENCY_CATALOG.file];
  }

  if (options.exifOnly) {
    const required = new Set<DependencyName>(["file"]);

    for (const input of inputs) {
      const format = formatFamilyFromExtension(input.absolutePath);
      if (!format) {
        continue;
      }

      if (format === "svg") {
        required.add("svgo");
        continue;
      }

      if (format === "ico" || format === "cur") {
        continue;
      }

      if (format === "bmp") {
        continue;
      }

      required.add("exiftool");
    }

    return Array.from(required).map((name) => DEPENDENCY_CATALOG[name]);
  }

  const required = new Set<DependencyName>(["file"]);

  for (const input of inputs) {
    const format = formatFamilyFromExtension(input.absolutePath);
    if (!format) {
      continue;
    }

    for (const dependency of FORMAT_DEPENDENCIES[format] ?? []) {
      required.add(dependency);
    }

    if (format === "png" && options.max) {
      required.add("zopflipng");
    }

    if (format === "raw" && options.max) {
      required.add("dnglab");
    }

    if (options.stripMeta && STRIP_METADATA_FORMATS.has(format)) {
      required.add("exiftool");
    }
  }

  return Array.from(required).map((name) => DEPENDENCY_CATALOG[name]);
}

export async function detectPlatform(): Promise<SupportedPlatform | null> {
  if (process.platform === "darwin") {
    return "macos";
  }

  if (process.platform !== "linux") {
    return null;
  }

  try {
    await access("/etc/debian_version", constants.F_OK);
    return "debian";
  } catch {
    try {
      const osRelease = (
        await readFile("/etc/os-release", "utf8")
      ).toLowerCase();
      if (osRelease.includes("id=ubuntu") || osRelease.includes("id=debian")) {
        return "debian";
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function findMissingDependencies(
  dependencies: DependencySpec[]
): Promise<DependencySpec[]> {
  const missing: DependencySpec[] = [];

  for (const dependency of dependencies) {
    if (!(await commandExists(dependency.binary))) {
      missing.push(dependency);
    }
  }

  return missing;
}

export async function installDependencies(
  platform: SupportedPlatform,
  targets: DependencyInstallTarget[],
  options: DependencyInstallOptions = {}
): Promise<void> {
  const commandRunner = options.runCheckedCommand ?? runCheckedCommand;
  const binaryExists = options.commandExists ?? commandExists;
  const packagesFor = (installer: DependencyInstaller) =>
    targets
      .filter((target) => target.installer === installer)
      .map((target) => target.package);
  const brewPackages = packagesFor("brew");
  const aptPackages = packagesFor("apt");
  const cargoPackages = targets.filter(
    (target) => target.installer === "cargo"
  );

  if (platform === "macos" && brewPackages.length > 0) {
    await commandRunner("brew", ["install", ...brewPackages], {
      stdio: "inherit",
    });
  }

  if (platform === "debian" && aptPackages.length > 0) {
    await commandRunner("sudo", ["apt", "update"], { stdio: "inherit" });
    await commandRunner("sudo", ["apt", "install", "-y", ...aptPackages], {
      stdio: "inherit",
    });
  }

  if (platform === "debian" && cargoPackages.length > 0) {
    if (!(await binaryExists("cargo"))) {
      throw new Error(
        "Cargo is required to install this tool on Debian/Ubuntu. Install Rust and Cargo, then retry."
      );
    }

    for (const target of cargoPackages) {
      if (!target.version) {
        throw new Error(
          `Cargo dependency ${target.package} must declare an exact version.`
        );
      }

      await commandRunner(
        "cargo",
        ["install", target.package, "--version", target.version, "--locked"],
        { stdio: "inherit" }
      );
    }
  }
}

export function collectDependencyInstallTargets(
  dependencies: DependencySpec[],
  platform: SupportedPlatform
): DependencyInstallTarget[] {
  const targets: DependencyInstallTarget[] = [];

  for (const dependency of dependencies) {
    if (platform === "macos" && dependency.brewPackage) {
      targets.push({ installer: "brew", package: dependency.brewPackage });
      continue;
    }

    if (platform === "debian" && dependency.aptPackage) {
      targets.push({ installer: "apt", package: dependency.aptPackage });
      continue;
    }

    if (platform === "debian" && dependency.cargoPackage) {
      targets.push({
        installer: "cargo",
        package: dependency.cargoPackage.crate,
        version: dependency.cargoPackage.version,
      });
    }
  }

  return Array.from(
    new Map(
      targets.map((target) => [
        `${target.installer}:${target.package}:${target.version ?? ""}`,
        target,
      ])
    ).values()
  );
}

export function formatDependencyInstallCommand(
  platform: SupportedPlatform,
  targets: DependencyInstallTarget[]
): string[] {
  const packagesFor = (installer: DependencyInstaller) =>
    targets
      .filter((target) => target.installer === installer)
      .map((target) => target.package);
  const commands: string[] = [];
  const brewPackages = packagesFor("brew");
  const aptPackages = packagesFor("apt");

  if (platform === "macos" && brewPackages.length > 0) {
    commands.push(`brew install ${brewPackages.join(" ")}`);
  }

  if (platform === "debian" && aptPackages.length > 0) {
    commands.push(`sudo apt install ${aptPackages.join(" ")}`);
  }

  if (platform === "debian") {
    for (const target of targets.filter(
      (candidate) => candidate.installer === "cargo"
    )) {
      if (!target.version) {
        throw new Error(
          `Cargo dependency ${target.package} must declare an exact version.`
        );
      }

      commands.push(
        `cargo install ${target.package} --version ${target.version} --locked`
      );
    }
  }

  return commands;
}

export function buildMissingDependencyMessage(
  missing: DependencySpec[],
  platform: SupportedPlatform | null
): string {
  const binaries = missing.map((dependency) => dependency.binary).join(", ");

  if (!platform) {
    return `Missing required tools: ${binaries}`;
  }

  const commands = formatDependencyInstallCommand(
    platform,
    collectDependencyInstallTargets(missing, platform)
  );
  return [
    `Missing required tools: ${binaries}`,
    `Install manually: ${commands.join("; ")}`,
  ].join("\n");
}

function formatFamilyFromExtension(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "jpeg";
    case ".png":
      return "png";
    case ".apng":
      return "apng";
    case ".gif":
      return "gif";
    case ".webp":
      return "webp";
    case ".svg":
      return "svg";
    case ".tif":
    case ".tiff":
      return "tiff";
    case ".heic":
    case ".heif":
      return "heif";
    case ".avif":
      return "avif";
    case ".bmp":
      return "bmp";
    case ".jxl":
      return "jxl";
    case ".ico":
      return "ico";
    case ".cur":
      return "cur";
    default:
      return RAW_EXTENSIONS.has(extension) ? "raw" : null;
  }
}
