import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
const jobNames = [
  "validate",
  "publish_npm",
  "package_archives",
  "draft_release",
  "update_tap",
  "publish_release",
] as const;

type Step = {
  env?: Record<string, string>;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type Job = {
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "runs-on"?: string;
  steps?: Step[];
};

type Workflow = {
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs?: Record<string, Job>;
  on?: { push?: { tags?: string[] } };
  permissions?: Record<string, string>;
};

async function readWorkflow(): Promise<Workflow> {
  const source = await readFile(
    resolve(root, ".github/workflows/release.yml"),
    "utf8"
  );
  return parse(source) as Workflow;
}

function requiredJobs(
  workflow: Workflow
): Record<(typeof jobNames)[number], Job> {
  const jobs = workflow.jobs ?? {};

  for (const jobName of jobNames) {
    if (!jobs[jobName]) {
      throw new Error(`Missing required release job: ${jobName}`);
    }
  }

  return jobs as Record<(typeof jobNames)[number], Job>;
}

function scripts(job: Job): string {
  return (job.steps ?? []).map((step) => step.run ?? "").join("\n");
}

function action(job: Job, name: string): Step | undefined {
  return (job.steps ?? []).find((step) => step.uses?.startsWith(`${name}@`));
}

function darwinArchiveValidation(runBlock: string): string {
  const match = runBlock.match(
    /for archive in squeezit-v"\$VERSION"-darwin-\*\.tar\.gz; do\n([\s\S]*?)\n\s*done/
  );

  if (!match) {
    throw new Error("Missing macOS archive validation block");
  }

  return match[0];
}

describe("tag release workflow", () => {
  test("contains syntactically valid shell run blocks", async () => {
    const jobs = requiredJobs(await readWorkflow());

    for (const job of Object.values(jobs)) {
      for (const step of job.steps ?? []) {
        if (step.run) {
          await expect(
            run("bash", ["-n", "-c", step.run])
          ).resolves.toMatchObject({ stderr: "" });
        }
      }
    }
  });

  test("runs only for version tags with serialized, least-privilege jobs", async () => {
    const workflow = await readWorkflow();
    const jobs = requiredJobs(workflow);

    expect(workflow.on?.push?.tags).toEqual(["v*"]);
    expect(workflow.concurrency).toEqual({
      group: "squeezit-release-mutation",
      "cancel-in-progress": false,
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(jobs)).toEqual(jobNames);
    expect(jobs.validate.permissions).toEqual({ contents: "read" });
    expect(jobs.publish_npm.permissions).toEqual({
      contents: "read",
      "id-token": "write",
    });
    expect(jobs.package_archives.permissions).toEqual({ contents: "read" });
    expect(jobs.draft_release.permissions).toEqual({ contents: "write" });
    expect(jobs.update_tap.permissions).toEqual({ contents: "read" });
    expect(jobs.publish_release.permissions).toEqual({ contents: "write" });
  });

  test("pins validation to Ubuntu, Node 24.16.0, and Bun 1.3.5", async () => {
    const jobs = requiredJobs(await readWorkflow());
    const validate = jobs.validate;

    expect(validate["runs-on"]).toBe("ubuntu-latest");
    expect(action(validate, "actions/setup-node")?.with).toEqual({
      "node-version": "24.16.0",
    });
    expect(action(validate, "oven-sh/setup-bun")?.with).toEqual({
      "bun-version": "1.3.5",
    });
    expect(JSON.stringify(validate)).not.toContain("registry-url");
  });

  test("pins every external action to an immutable reviewed commit", async () => {
    const jobs = requiredJobs(await readWorkflow());
    const workflowSource = await readFile(
      resolve(root, ".github/workflows/release.yml"),
      "utf8"
    );
    const uses = Object.values(jobs).flatMap((job) =>
      (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : []))
    );

    expect(uses).toEqual(
      expect.arrayContaining([
        "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
        "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
        "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
      ])
    );
    expect(uses).toHaveLength(15);
    expect(uses.every((reference) => /@[a-f0-9]{40}$/.test(reference))).toBe(
      true
    );
    expect(workflowSource).toMatch(
      /actions\/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5\.0\.0/
    );
    expect(workflowSource).toMatch(
      /actions\/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5\.0\.0/
    );
    expect(workflowSource).toMatch(
      /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\.2\.0/
    );
    expect(workflowSource).toMatch(
      /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2/
    );
    expect(workflowSource).toMatch(
      /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4\.3\.0/
    );
  });

  test("validates tag, main reachability, changelog, and focused checks", async () => {
    const validate = requiredJobs(await readWorkflow()).validate;
    const run = scripts(validate);

    expect(run).toContain('VERSION="${GITHUB_REF_NAME#v}"');
    expect(run).toContain('test "$VERSION" = "$PACKAGE_VERSION"');
    expect(run).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main'
    );
    expect(run).toContain('test -f "changelogs/$VERSION.md"');
    expect(run).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/releases/tags/$GITHUB_REF_NAME"'
    );
    expect(run).toContain('grep -q "HTTP 404"');
    expect(run).toContain("bun ci");
    expect(run).toContain("bun run typecheck");
    expect(run).toContain("bun run test:cli");
    expect(run).toContain("bun run check:exports");
    expect(run).toContain("HUSKY=0 npm pack --dry-run");
    expect(run).not.toMatch(/test:(?:full|max)|--max\b/);
  });

  test("installs the PNG tools needed by the CLI dry-run contract before CLI tests", async () => {
    const validate = requiredJobs(await readWorkflow()).validate;
    const run = scripts(validate);

    expect(run).toContain("sudo apt-get update");
    expect(run).toContain("sudo apt-get install --yes pngcrush optipng");
    expect(run).toContain("cargo install oxipng --version 10.1.0 --locked");
    expect(run).toContain('echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"');
    expect(
      run.indexOf("cargo install oxipng --version 10.1.0 --locked")
    ).toBeLessThan(run.indexOf("bun run test:cli"));
  });

  test("publishes an exact verified npm tarball through OIDC", async () => {
    const publish = requiredJobs(await readWorkflow()).publish_npm;
    const run = scripts(publish);
    const serialized = JSON.stringify(publish);

    expect(publish.needs).toBe("validate");
    expect(run).toContain("bun run build");
    expect(run).toContain(
      "HUSKY=0 npm pack --ignore-scripts --pack-destination"
    );
    expect(run.indexOf("bun run build")).toBeLessThan(
      run.indexOf("npm pack --ignore-scripts")
    );
    expect(run).toContain("shopt -s nullglob");
    expect(run).toContain('tarballs=("$PUBLISH_DIR"/*.tgz)');
    expect(run).toContain('test "${#tarballs[@]}" -eq 1');
    expect(run).toContain('NPM_TARBALL="${tarballs[0]}"');
    expect(run).not.toContain("pack.json");
    expect(run).toContain('npm view "squeezit@$VERSION" dist.integrity');
    expect(run).toContain("openssl dgst -sha512 -binary");
    expect(run).toContain("base64");
    expect(run).toContain('test "$PUBLISHED_INTEGRITY" = "$LOCAL_INTEGRITY"');
    expect(run).toContain(
      'HUSKY=0 npm publish "$NPM_TARBALL" --access public --provenance'
    );
    expect(run).toContain("already exists with the verified tarball");
    expect(serialized).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|registry-url/);
  });

  test("stages Oclif packaging only in runner temp and emits normalized verified artifacts", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8")
    );
    const fixtures = JSON.parse(
      await readFile(
        resolve(root, "tests/fixtures/release/expected-archives.json"),
        "utf8"
      )
    ) as string[];
    const packageJob = requiredJobs(await readWorkflow()).package_archives;
    const run = scripts(packageJob);
    const uploadPath = action(packageJob, "actions/upload-artifact")?.with
      ?.path;

    expect(packageJob.needs).toEqual(["validate", "publish_npm"]);
    expect(run).toContain('STAGE="$RUNNER_TEMP/oclif-package"');
    expect(run).toContain("npm install --package-lock-only --ignore-scripts");
    expect(run).toContain("test ! -e package-lock.json");
    expect(run).toContain("oclif pack tarballs --no-xz --prune-lockfiles");
    expect(run).not.toContain("HUSKY=0 bunx oclif pack tarballs");
    expect(run).toContain("oclif.update.node.targets.join");
    expect(run).toContain('normalized="squeezit-v${VERSION}-${target}.tar.gz"');
    expect(run).toContain("SHA256SUMS");
    expect(run).toContain("release-metadata.json");
    expect(run).toContain("npmTarball:");
    expect(run).toContain("archives,");
    expect(run).toContain("sha256sum --check SHA256SUMS");
    expect(run).toContain("sqz version --json");
    expect(run).toContain("sqz commands --json");
    expect(run).toContain("sqz compress --help");
    expect(run).toContain("tar -tzf");
    expect(run).toContain(
      "package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock"
    );
    expect(run).toContain('SMOKE_DIR="$RUNNER_TEMP/linux-smoke"');
    expect(run).not.toContain("mkdir linux-smoke");

    expect(uploadPath).toBeTypeOf("string");
    expect((uploadPath as string).split("\n")).toEqual([
      "${{ runner.temp }}/release-artifacts/squeezit-v${{ needs.validate.outputs.version }}-darwin-arm64.tar.gz",
      "${{ runner.temp }}/release-artifacts/squeezit-v${{ needs.validate.outputs.version }}-darwin-x64.tar.gz",
      "${{ runner.temp }}/release-artifacts/squeezit-v${{ needs.validate.outputs.version }}-linux-x64.tar.gz",
      "${{ runner.temp }}/release-artifacts/SHA256SUMS",
      "${{ runner.temp }}/release-artifacts/release-metadata.json",
    ]);
    expect(uploadPath).not.toMatch(/linux-smoke|oclif-package|[*?]/);

    expect(packageJson.oclif.update.node.targets).toEqual(fixtures);
    expect(
      fixtures.map(
        (target) => `squeezit-v${packageJson.version}-${target}.tar.gz`
      )
    ).toEqual(
      packageJson.oclif.update.node.targets.map(
        (target: string) => `squeezit-v${packageJson.version}-${target}.tar.gz`
      )
    );
  });

  test("validates a matching macOS archive without a pipefail broken pipe", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "squeezit-archive-"));
    const archive = "squeezit-v2.0.4-darwin-arm64.tar.gz";

    try {
      await mkdir(resolve(directory, "squeezit/bin"), { recursive: true });
      await mkdir(resolve(directory, "squeezit/files"), { recursive: true });
      await writeFile(
        resolve(directory, "squeezit/bin/sqz"),
        "#!/usr/bin/env node\n"
      );

      for (let index = 0; index < 2_000; index += 1) {
        await writeFile(
          resolve(
            directory,
            "squeezit/files",
            `${index.toString().padStart(4, "0")}-${"x".repeat(180)}`
          ),
          ""
        );
      }

      await run("tar", ["-czf", archive, "squeezit"], {
        cwd: directory,
      });

      const packageJob = requiredJobs(await readWorkflow()).package_archives;
      await expect(
        run(
          "bash",
          [
            "-o",
            "pipefail",
            "-c",
            `VERSION=2.0.4\n${darwinArchiveValidation(scripts(packageJob))}`,
          ],
          { cwd: directory }
        )
      ).resolves.toMatchObject({ stderr: "", stdout: "" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("resumes only draft releases, updates the tap on macOS, then publishes", async () => {
    const jobs = requiredJobs(await readWorkflow());
    const draftRun = scripts(jobs.draft_release);
    const tapRun = scripts(jobs.update_tap);
    const publishRun = scripts(jobs.publish_release);

    expect(jobs.draft_release.needs).toEqual([
      "validate",
      "publish_npm",
      "package_archives",
    ]);
    expect(draftRun).toContain("gh release view");
    expect(draftRun).toContain('test "$IS_DRAFT" = "true"');
    expect(draftRun).toContain("gh release create");
    expect(draftRun).toContain("--draft");
    expect(draftRun).toContain("--notes-file");
    expect(draftRun).toContain(
      'gh release edit "$TAG" --notes-file "changelogs/$VERSION.md"'
    );
    expect(draftRun).toContain("gh release upload");
    expect(draftRun).toContain("--clobber");

    expect(jobs.update_tap.needs).toEqual([
      "validate",
      "publish_npm",
      "package_archives",
      "draft_release",
    ]);
    expect(jobs.update_tap["runs-on"]).toBe("macos-latest");
    expect(JSON.stringify(jobs.update_tap)).toContain("HOMEBREW_TAP_TOKEN");
    expect(tapRun).toContain("scripts/render-homebrew-formula.ts");
    expect(tapRun).toContain("Gem::Version");
    expect(tapRun).toContain("requested >= existing ? 0 : 1");
    expect(tapRun).toContain("Refusing to replace newer tap formula");
    expect(tapRun.indexOf("Gem::Version")).toBeLessThan(
      tapRun.indexOf("scripts/render-homebrew-formula.ts")
    );
    expect(tapRun).toContain("--sha256");
    expect(tapRun).toContain("brew tap ghaschel/tap");
    expect(tapRun).toContain(
      "brew install --build-from-source ghaschel/tap/squeezit"
    );
    expect(tapRun).not.toContain(
      'brew install --build-from-source "$GITHUB_WORKSPACE/tap/Formula/squeezit.rb"'
    );
    expect(tapRun).toContain("sqz version --json");
    expect(tapRun).toContain("sqz doctor --json");
    expect(tapRun).toContain("git -C tap diff --quiet");
    expect(tapRun).toContain("git -C tap push origin HEAD");
    expect(tapRun.indexOf("git -C tap commit")).toBeLessThan(
      tapRun.indexOf("brew install --build-from-source")
    );
    expect(jobs.update_tap.steps?.at(-1)?.if).toBe(
      "steps.formula.outputs.changed == 'true'"
    );

    expect(jobs.publish_release.needs).toBe("update_tap");
    expect(publishRun).toContain("gh release edit");
    expect(publishRun).toContain("--draft=false");
    expect(jobs.publish_release.steps?.[0]?.env?.GH_REPO).toBe(
      "${{ github.repository }}"
    );
  });
});
