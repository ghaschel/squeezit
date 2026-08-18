import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROJECT_SKILLS = [
  {
    id: "squeezit-add-command",
    path: ".agents/skills/squeezit-add-command/SKILL.md",
    when: "CLI taxonomy, flags, output, schemas, or JSON contracts change.",
  },
  {
    id: "squeezit-add-image-format",
    path: ".agents/skills/squeezit-add-image-format/SKILL.md",
    when: "Formats, optimizers, metadata behavior, or native tools change.",
  },
  {
    id: "squeezit-add-integration",
    path: ".agents/skills/squeezit-add-integration/SKILL.md",
    when: "Bundler, framework, compiler, or package integrations change.",
  },
  {
    id: "squeezit-release",
    path: ".agents/skills/squeezit-release/SKILL.md",
    when: "Versioning, publishing, standalone archives, or Homebrew change.",
  },
  {
    id: "committing-with-commitlint",
    path: ".claude/skills/committing-with-commitlint/SKILL.md",
    when: "A commit is about to be created.",
  },
] as const;

const MAX_SENSITIVE_PATHS = new Set([
  "src/api/options.ts",
  "src/utils/options.ts",
  "src/utils/optimizer.ts",
]);

export interface AgentHarnessIssue {
  code: string;
  details?: Record<string, unknown>;
  message: string;
  remediation: string;
}

export interface AgentSkill {
  available: boolean;
  id: string;
  path: string;
  when: string;
}

export interface AgentStatusData {
  dependencies: {
    available: boolean;
    healthy: boolean;
    platform: string | null;
    tools: Array<{
      binary: string;
      minimumVersion: string;
      provider: string;
      status: string;
    }>;
    unavailable: number;
  };
  installation: {
    status: "healthy" | "warning" | "unknown";
    warnings: AgentHarnessIssue[];
  };
  repository: {
    branch: string | null;
    changedPaths: string[];
    head: string | null;
    root: string;
    upstream: { ahead: number; behind: number; name: string | null };
    worktree: {
      clean: boolean;
      entries: Array<{ path: string; staged: boolean; status: string }>;
    };
  };
  runtime: {
    bun: { actual: string | null; compatible: boolean; expected: string };
    node: { actual: string; compatible: boolean; minimum: string };
    package: { name: string; version: string };
    platform: string;
  };
  setup: { bunLock: boolean; nodeModules: boolean };
  skills: { available: AgentSkill[]; recommended: AgentSkill[] };
  verification: AgentWorkflowRecommendation;
}

export interface AgentWorkflowRecommendation {
  commands: string[];
  reasons: string[];
  skills: AgentSkill[];
  slowRequired: boolean;
}

export interface AgentPreflightData {
  blockers: AgentHarnessIssue[];
  nextActions: string[];
  status: AgentStatusData;
  warnings: AgentHarnessIssue[];
}

export interface AgentHarnessEnvelope<T> {
  command: "agent:preflight" | "agent:status";
  data: T;
  issues: AgentHarnessIssue[];
  ok: boolean;
  schemaVersion: 1;
}

interface PackageMetadata {
  engines?: { node?: unknown };
  name?: unknown;
  packageManager?: unknown;
  version?: unknown;
}

interface DynamicDependencyDiagnostic {
  binary: string;
  minimumVersion: string;
  provider: string;
  status: string;
}

interface DynamicDependencyModule {
  DEPENDENCY_CATALOG: Record<string, unknown>;
  detectPlatform: () => Promise<string | null>;
  diagnoseDependencies: (
    dependencies: string[]
  ) => Promise<DynamicDependencyDiagnostic[]>;
}

interface DynamicInstallationModule {
  inspectSqueezitInstallations: (options: {
    activePackageRoot: string;
    activeVersion: string;
  }) => Promise<{
    status: "healthy" | "warning";
    warnings: AgentHarnessIssue[];
  }>;
}

export class AgentHarnessError extends Error {
  constructor(readonly issue: AgentHarnessIssue) {
    super(issue.message);
  }
}

export async function collectAgentStatus(
  options: {
    paths?: string[];
    root?: string;
  } = {}
): Promise<AgentStatusData> {
  const root = options.root ? resolve(options.root) : await gitProjectRoot();
  const metadata = await readPackageMetadata(root);
  const expectedBun = parseBunVersion(metadata.packageManager);
  const minimumNode = parseMinimumNodeVersion(metadata.engines?.node);
  const requestedPaths = resolveRequestedPaths(root, options.paths ?? []);
  const repository = await collectRepositoryStatus(root, requestedPaths);
  const [bunLock, nodeModules, availableSkills] = await Promise.all([
    pathExists(resolve(root, "bun.lock")),
    pathExists(resolve(root, "node_modules")),
    collectAvailableSkills(root),
  ]);
  const verification = recommendAgentWorkflow({
    changedPaths: repository.changedPaths,
    diff: await gitDiff(root),
  });
  const diagnostics = nodeModules
    ? await collectDiagnostics(root, String(metadata.version ?? "unknown"))
    : unavailableDiagnostics();

  return {
    dependencies: diagnostics.dependencies,
    installation: diagnostics.installation,
    repository,
    runtime: {
      bun: {
        actual: process.versions.bun ?? null,
        compatible: process.versions.bun === expectedBun,
        expected: expectedBun,
      },
      node: {
        actual: process.versions.node,
        compatible: compareVersions(process.versions.node, minimumNode) >= 0,
        minimum: minimumNode,
      },
      package: {
        name: String(metadata.name ?? "squeezit"),
        version: String(metadata.version ?? "unknown"),
      },
      platform: `${process.platform}-${process.arch}`,
    },
    setup: { bunLock, nodeModules },
    skills: {
      available: availableSkills,
      recommended: verification.skills,
    },
    verification,
  };
}

export function buildAgentPreflight(
  status: AgentStatusData
): AgentPreflightData & { ok: boolean } {
  const blockers: AgentHarnessIssue[] = [];
  const warnings: AgentHarnessIssue[] = [];

  if (!status.runtime.bun.compatible) {
    blockers.push({
      code: "BUN_VERSION_MISMATCH",
      details: status.runtime.bun,
      message: `Bun ${status.runtime.bun.expected} is required; detected ${status.runtime.bun.actual ?? "none"}.`,
      remediation: `Install Bun ${status.runtime.bun.expected} before changing this repository.`,
    });
  }

  if (!status.runtime.node.compatible) {
    blockers.push({
      code: "NODE_VERSION_UNSUPPORTED",
      details: status.runtime.node,
      message: `Node ${status.runtime.node.minimum} or later is required.`,
      remediation:
        "Use a supported Node runtime before changing this repository.",
    });
  }

  if (!status.setup.bunLock) {
    blockers.push({
      code: "BUN_LOCK_MISSING",
      message: "bun.lock is missing from the repository.",
      remediation:
        "Restore bun.lock before changing dependencies or running verification.",
    });
  }

  if (!status.setup.nodeModules) {
    blockers.push({
      code: "DEPENDENCIES_NOT_INSTALLED",
      message:
        "Project dependencies are unavailable because node_modules is missing.",
      remediation:
        "Run bun install before changing code or running project tools.",
    });
  }

  if (!status.repository.worktree.clean) {
    warnings.push({
      code: "WORKTREE_DIRTY",
      details: { paths: status.repository.changedPaths },
      message: "The worktree already contains changes.",
      remediation:
        "Preserve these changes and avoid overwriting or discarding them.",
    });
  }

  if (!status.repository.upstream.name) {
    warnings.push({
      code: "UPSTREAM_UNCONFIGURED",
      message: "The current branch has no configured upstream.",
      remediation:
        "Inspect the branch before a later push; no network action is needed now.",
    });
  }

  if (!status.dependencies.healthy) {
    warnings.push({
      code: "OPTIMIZER_UNHEALTHY",
      details: {
        platform: status.dependencies.platform,
        unavailable: status.dependencies.unavailable,
      },
      message:
        "One or more native image optimizers are unavailable or unhealthy.",
      remediation:
        "Run sqz doctor --json before image work and follow its remediation.",
    });
  }

  warnings.push(...status.installation.warnings);

  return {
    blockers,
    nextActions: [
      "Read AGENTS.md and every reported relevant skill before changing code.",
      "Run sqz capabilities --json before selecting a Squeezit command.",
      "Run sqz doctor --json before image work.",
      "Use --dry-run or a plan artifact before asking for approval to apply image changes.",
      ...status.verification.commands,
    ],
    ok: blockers.length === 0,
    status,
    warnings,
  };
}

export function recommendAgentWorkflow(options: {
  changedPaths: string[];
  diff: string;
}): AgentWorkflowRecommendation {
  const changedPaths = options.changedPaths.map(normalizePath);
  const skills = new Map<string, AgentSkill>();
  const commands = new Set(["bun run verify:agent"]);
  const reasons = [
    "Every agent change starts with the non-slow verification baseline.",
  ];

  const addSkill = (id: string) => {
    const skill = PROJECT_SKILLS.find((candidate) => candidate.id === id);
    if (!skill) return;
    skills.set(id, { ...skill, available: true });
  };

  for (const path of changedPaths) {
    if (
      path.startsWith("src/cli/") ||
      path.startsWith("schemas/") ||
      path === "oclif.manifest.json" ||
      path === "tsup.oclif.config.ts"
    ) {
      addSkill("squeezit-add-command");
    }

    if (path.startsWith("src/integrations/")) {
      addSkill("squeezit-add-integration");
      const integration = path.split("/").at(-1)?.replace(/\.ts$/, "");
      if (integration && integration !== "_placeholder") {
        commands.add(`bun run test:${integration}`);
        reasons.push(`${path} owns a ${integration} integration test lane.`);
      }
    }

    if (
      path === "src/core/dependencies.ts" ||
      path === "src/utils/discovery.ts" ||
      path === "src/utils/optimizer.ts" ||
      path === "src/types/optimization.ts" ||
      path.startsWith("tests/fixtures/formats/") ||
      path.startsWith("tests/integration/api-")
    ) {
      addSkill("squeezit-add-image-format");
      commands.add("bun run test:integration");
      reasons.push(
        `${path} changes image behavior or its native-tool contract.`
      );
    }

    if (
      path.startsWith(".github/workflows/release") ||
      path === "docs/releasing.md" ||
      path.startsWith("changelogs/") ||
      path === "scripts/check-release-readiness.ts" ||
      path === "scripts/render-homebrew-formula.ts"
    ) {
      addSkill("squeezit-release");
    }

    if (
      path.startsWith("scripts/agent-") ||
      path.startsWith("tests/agent/") ||
      path === "docs/agent-harness.md"
    ) {
      commands.add("bun run test:agent");
      reasons.push(`${path} changes the deterministic agent harness.`);
    }
  }

  const slowRequired =
    changedPaths.includes("tests/integration/api-max.test.ts") ||
    (changedPaths.some((path) => MAX_SENSITIVE_PATHS.has(path)) &&
      /options\.max|mode\s*={2,3}\s*["']max["']|profile\s*(?::|=|\s+)\s*["']?max/.test(
        options.diff
      ));
  if (slowRequired) {
    commands.add("bun run test:slow");
    reasons.push("The diff changes explicit max-profile behavior.");
  }

  return {
    commands: Array.from(commands),
    reasons: unique(reasons),
    skills: Array.from(skills.values()),
    slowRequired,
  };
}

export function resolveRequestedPaths(root: string, paths: string[]): string[] {
  return unique(
    paths.map((path) => {
      if (!path || path.startsWith("-")) {
        throw invalidPath(
          path,
          "Each --path value must be a repository-relative path."
        );
      }

      if (isAbsolute(path)) {
        throw invalidPath(
          path,
          "Each --path value must be a repository-relative path."
        );
      }

      const resolved = resolve(root, path);
      const fromRoot = relative(root, resolved);
      if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
        throw invalidPath(
          path,
          "--path values must stay inside the repository root."
        );
      }

      return normalizePath(fromRoot);
    })
  );
}

export function parseHarnessArguments(argv: string[]): { paths: string[] } {
  const paths: string[] = [];
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--path") {
      const path = argv[index + 1];
      if (!path) {
        throw new AgentHarnessError({
          code: "VALIDATION_ERROR",
          message: "--path requires a repository-relative value.",
          remediation: "Pass --path <repository-relative-path>.",
        });
      }
      paths.push(path);
      index += 1;
      continue;
    }

    throw new AgentHarnessError({
      code: "VALIDATION_ERROR",
      message: `Unknown agent harness option: ${argument}`,
      remediation:
        "Use --json and optional repeated --path <repository-relative-path> values.",
    });
  }

  if (!json) {
    throw new AgentHarnessError({
      code: "JSON_REQUIRED",
      message: "The agent harness requires --json in v1.",
      remediation: "Re-run the command with --json.",
    });
  }

  return { paths };
}

export async function runHarnessCommand(
  command: "agent:preflight" | "agent:status",
  argv: string[]
): Promise<void> {
  try {
    const { paths } = parseHarnessArguments(argv);
    const status = await collectAgentStatus({ paths });
    const preflight =
      command === "agent:preflight" ? buildAgentPreflight(status) : undefined;
    const issues = preflight?.ok === false ? preflight.blockers : [];
    const envelope: AgentHarnessEnvelope<AgentPreflightData | AgentStatusData> =
      {
        command,
        data: preflight ?? status,
        issues,
        ok: preflight?.ok ?? true,
        schemaVersion: 1,
      };

    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = envelope.ok ? 0 : 1;
  } catch (error) {
    const issue = toHarnessIssue(error);
    const envelope: AgentHarnessEnvelope<Record<string, never>> = {
      command,
      data: {},
      issues: [issue],
      ok: false,
      schemaVersion: 1,
    };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = 1;
  }
}

async function collectAvailableSkills(root: string): Promise<AgentSkill[]> {
  return Promise.all(
    PROJECT_SKILLS.map(async (skill) => ({
      ...skill,
      available: await pathExists(resolve(root, skill.path)),
    }))
  );
}

async function collectDiagnostics(
  root: string,
  version: string
): Promise<Pick<AgentStatusData, "dependencies" | "installation">> {
  try {
    const dependencies =
      (await import("../src/core/dependencies.ts")) as DynamicDependencyModule;
    const installations =
      (await import("../src/cli/installations.ts")) as DynamicInstallationModule;
    const names = Object.keys(dependencies.DEPENDENCY_CATALOG);
    const [platform, tools, installation] = await Promise.all([
      dependencies.detectPlatform(),
      dependencies.diagnoseDependencies(names),
      installations.inspectSqueezitInstallations({
        activePackageRoot: root,
        activeVersion: version,
      }),
    ]);

    return {
      dependencies: {
        available: true,
        healthy: tools.every((tool) => tool.status === "healthy"),
        platform,
        tools: tools.map((tool) => ({
          binary: tool.binary,
          minimumVersion: tool.minimumVersion,
          provider: tool.provider,
          status: tool.status,
        })),
        unavailable: tools.filter((tool) => tool.status !== "healthy").length,
      },
      installation,
    };
  } catch {
    return unavailableDiagnostics();
  }
}

async function collectRepositoryStatus(
  root: string,
  requestedPaths: string[]
): Promise<AgentStatusData["repository"]> {
  const [branch, head, porcelain, upstream] = await Promise.all([
    git(root, ["branch", "--show-current"]),
    git(root, ["rev-parse", "--short", "HEAD"]).catch(() => ""),
    git(root, ["status", "--porcelain=v1", "-z"]),
    collectUpstream(root),
  ]);
  const entries = parseGitPorcelain(porcelain);

  return {
    branch: branch.trim() || null,
    changedPaths: unique([
      ...entries.map((entry) => entry.path),
      ...requestedPaths,
    ]),
    head: head.trim() || null,
    root,
    upstream,
    worktree: { clean: entries.length === 0, entries },
  };
}

async function collectUpstream(root: string): Promise<{
  ahead: number;
  behind: number;
  name: string | null;
}> {
  const name = await git(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]).catch(() => "");
  if (!name.trim()) return { ahead: 0, behind: 0, name: null };

  const counts = await git(root, [
    "rev-list",
    "--left-right",
    "--count",
    `${name.trim()}...HEAD`,
  ]).catch(() => "0\t0");
  const [behind = "0", ahead = "0"] = counts.trim().split(/\s+/);
  return {
    ahead: Number(ahead) || 0,
    behind: Number(behind) || 0,
    name: name.trim(),
  };
}

async function gitDiff(root: string): Promise<string> {
  const [unstaged, staged] = await Promise.all([
    git(root, ["diff", "--no-ext-diff", "--unified=0"]),
    git(root, ["diff", "--cached", "--no-ext-diff", "--unified=0"]),
  ]);
  return `${unstaged}\n${staged}`;
}

async function gitProjectRoot(): Promise<string> {
  const { stdout } = await execFileAsync("git", [
    "rev-parse",
    "--show-toplevel",
  ]);
  return stdout.trim();
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readPackageMetadata(root: string): Promise<PackageMetadata> {
  try {
    return JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8")
    ) as PackageMetadata;
  } catch {
    throw new AgentHarnessError({
      code: "PROJECT_MANIFEST_INVALID",
      message: "Unable to read the repository package.json.",
      remediation:
        "Restore a valid package.json before using the agent harness.",
    });
  }
}

export function parseGitPorcelain(
  output: string
): Array<{ path: string; staged: boolean; status: string }> {
  const entries: Array<{ path: string; staged: boolean; status: string }> = [];
  const records = output.split("\0").filter(Boolean);

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const status = record.slice(0, 2);
    entries.push({
      path: normalizePath(record.slice(3)),
      staged: status[0] !== " " && status[0] !== "?",
      status,
    });
    if (status.includes("R") || status.includes("C")) index += 1;
  }

  return entries;
}

function parseBunVersion(value: unknown): string {
  const match = typeof value === "string" ? /^bun@(.+)$/.exec(value) : null;
  return match?.[1] ?? "1.3.5";
}

function parseMinimumNodeVersion(value: unknown): string {
  const match =
    typeof value === "string" ? />=\s*(\d+(?:\.\d+){0,2})/.exec(value) : null;
  return match?.[1] ?? "22.13.0";
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
  return (
    version
      .replace(/^v/, "")
      .split("-", 1)[0]
      ?.split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0)) ?? [0]
  );
}

function invalidPath(path: string, message: string): AgentHarnessError {
  return new AgentHarnessError({
    code: "VALIDATION_ERROR",
    details: { path },
    message,
    remediation:
      "Pass a path relative to this repository, without .. segments.",
  });
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function toHarnessIssue(error: unknown): AgentHarnessIssue {
  if (error instanceof AgentHarnessError) return error.issue;
  return {
    code: "GIT_UNAVAILABLE",
    message: "Unable to inspect the current Git repository.",
    remediation: "Run the agent harness from a readable Git working tree.",
  };
}

function unavailableDiagnostics(): Pick<
  AgentStatusData,
  "dependencies" | "installation"
> {
  return {
    dependencies: {
      available: false,
      healthy: false,
      platform: null,
      tools: [],
      unavailable: 0,
    },
    installation: { status: "unknown", warnings: [] },
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
