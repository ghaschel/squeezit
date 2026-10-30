import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { execa } from "execa";
import { afterEach, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "bin/run.js");
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function fixture(version = "11.3.0") {
  const cwd = await mkdtemp(join(tmpdir(), "sqz-upgrade-cli-"));
  workspaces.push(cwd);
  await mkdir(join(cwd, "bin"));
  await writeFile(join(cwd, "document.pdf"), "%PDF-1.7\nfixture\n");
  await writeFile(join(cwd, "version"), `${version}\n`);
  await writeFile(join(cwd, "calls"), "");
  const update = `
printf '%s\\n' "$*" >> "$SQZ_TEST_ROOT/calls"
printf 'package-manager stdout\\n'
printf 'package-manager stderr\\n' >&2
if [ "$SQZ_TEST_UPGRADE" = fail ]; then exit 7; fi
if [ "$SQZ_TEST_UPGRADE" != unchanged ]; then printf '12.4.2\\n' > "$SQZ_TEST_ROOT/version"; fi
`;
  const scripts: Record<string, string> = {
    file: "printf 'file-5.41\\n'",
    qpdf: 'IFS= read -r version < "$SQZ_TEST_ROOT/version"\nprintf "qpdf version %s\\n" "$version"',
    brew: `if [ "$1" = list ]; then IFS= read -r version < "$SQZ_TEST_ROOT/version"; printf 'qpdf %s\\n' "$version"; exit 0; fi\n${update}`,
    "dpkg-query":
      'IFS= read -r version < "$SQZ_TEST_ROOT/version"\nprintf "%s\\n" "$version"',
    sudo: `if [ "$1" = -n ]; then shift; fi\nif [ "$2" = update ]; then printf '%s\\n' "$*" >> "$SQZ_TEST_ROOT/calls"; exit 0; fi\n${update}`,
  };
  for (const [name, body] of Object.entries(scripts)) {
    const path = join(cwd, "bin", name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
  }
  return {
    cwd,
    run: (flags: string[], behavior = "success") =>
      execa(
        process.execPath,
        [launcher, "deps", "upgrade", "document.pdf", ...flags],
        {
          cwd,
          reject: false,
          env: {
            ...process.env,
            PATH: `${join(cwd, "bin")}:${process.env.PATH}`,
            SQZ_TEST_ROOT: cwd,
            SQZ_TEST_UPGRADE: behavior,
            NO_COLOR: "1",
            FORCE_COLOR: "0",
          },
        }
      ),
  };
}

test("previews the stricter target without confirmation or package writes", async () => {
  const f = await fixture();
  const result = await f.run(["--dry-run", "--json", "--verbose"]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({
    schemaVersion: 2,
    command: "deps upgrade",
    ok: true,
    data: {
      dryRun: true,
      ready: false,
      attempted: false,
      toolsBefore: expect.arrayContaining([
        expect.objectContaining({
          binary: "qpdf",
          minimumVersion: "11.3.0",
          targetVersion: "12.4.2",
          targetStatus: "outdated",
        }),
      ]),
      diagnostics: expect.any(Array),
    },
  });
  expect(await readFile(join(f.cwd, "calls"), "utf8")).toBe("");
  const ajv = new Ajv2020({ logger: false, strict: false });
  for (const name of ["capabilities-v1", "optimization-plan-v1"])
    ajv.addSchema(
      JSON.parse(
        await readFile(join(root, `schemas/${name}.schema.json`), "utf8")
      )
    );
  const validate = ajv.compile(
    JSON.parse(
      await readFile(
        join(root, "schemas/command-envelope-v2.schema.json"),
        "utf8"
      )
    )
  );
  expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
});

test("requires yes before a noninteractive mutation and rejects invalid flags", async () => {
  const f = await fixture();
  for (const flags of [["--json"], []]) {
    const result = await f.run(flags);
    expect(result.exitCode).toBe(1);
    if (flags.length)
      expect(JSON.parse(result.stdout).error.code).toBe(
        "CONFIRMATION_REQUIRED"
      );
    else expect(result.stderr).toContain("--yes is required");
  }
  const invalid = await f.run(["--profile", "invalid", "--json"]);
  expect(invalid.exitCode).toBe(1);
  expect(JSON.parse(invalid.stdout).error.code).toBe("VALIDATION_ERROR");
  expect(await readFile(join(f.cwd, "calls"), "utf8")).toBe("");
});

test("verifies an upgrade and keeps installer output out of JSON and in a receipt", async () => {
  const f = await fixture();
  const result = await f.run(["--yes", "--json", "--receipt", "upgrade.json"]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: true,
    data: {
      ready: true,
      attempted: true,
      executed: expect.arrayContaining([
        expect.objectContaining({
          output: expect.stringContaining("package-manager stdout"),
        }),
      ]),
      toolsAfter: expect.arrayContaining([
        expect.objectContaining({
          binary: "qpdf",
          targetStatus: "current",
          normalizedVersion: "12.4.2",
        }),
      ]),
    },
  });
  const receipt = JSON.parse(
    await readFile(join(f.cwd, "upgrade.json"), "utf8")
  );
  expect(receipt).toMatchObject({
    command: "deps upgrade",
    status: "completed",
    tools: {
      after: expect.arrayContaining([
        expect.objectContaining({
          binary: "qpdf",
          normalizedVersion: "12.4.2",
        }),
      ]),
    },
  });
  expect(await readFile(join(f.cwd, "calls"), "utf8")).not.toBe("");
});

test("fails when the package manager returns success but the old tool remains", async () => {
  const f = await fixture();
  const result = await f.run(["--yes", "--json"], "unchanged");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: false,
    error: { code: "DEPENDENCY_UPGRADE_FAILED" },
    data: { ready: false, attempted: true },
  });
});

test("records package command failures in the receipt terminal outcome", async () => {
  const f = await fixture();
  const result = await f.run(
    ["--yes", "--json", "--receipt", "failed.json"],
    "fail"
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: false,
    data: {
      executed: expect.arrayContaining([
        expect.objectContaining({
          exitCode: 7,
          error: expect.stringContaining("package-manager stderr"),
        }),
      ]),
    },
  });
  expect(
    JSON.parse(await readFile(join(f.cwd, "failed.json"), "utf8"))
  ).toMatchObject({
    status: "completed",
    terminal: {
      ok: false,
      exitCode: 1,
      error: { code: "DEPENDENCY_UPGRADE_FAILED" },
    },
  });
});

test.each(["12.4.2", "12.5.0"])(
  "retains satisfied tools (%s) without requiring yes or invoking an installer",
  async (version) => {
    const f = await fixture(version);
    const result = await f.run(["--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: { ready: true, attempted: false, commands: [] },
    });
    expect(await readFile(join(f.cwd, "calls"), "utf8")).toBe("");
  }
);

test("supports human previews and structured phase events", async () => {
  const f = await fixture();
  const human = await f.run(["--dry-run"]);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain("target >=12.4.2 (outdated)");
  expect(human.stdout).toContain("Dry run: no dependency changes made.");
  const streamed = await f.run(["--yes", "--events", "jsonl"]);
  expect(streamed.exitCode).toBe(0);
  expect(streamed.stderr).toBe("");
  const events = streamed.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events[0].event).toBe("command.started");
  expect(events.at(-1)).toMatchObject({
    event: "command.completed",
    ok: true,
    data: { ready: true },
  });
  expect(events.some((event) => event.event === "phase.started")).toBe(true);
});
