import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api avif integration", () => {
  defineApiFormatTests("avif");
});

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import {
  copyApiFixtureToWorkspace,
  createApiWorkspace,
  getApiFixture,
} from "../helpers/api";

test("preserves decoded AVIF samples through the PNG intermediate", async () => {
  const workspace = await createApiWorkspace();
  const path = await copyApiFixtureToWorkspace(
    getApiFixture("avif"),
    workspace
  );
  execFileSync("avifdec", [path, `${path}.before.y4m`]);
  const before = createHash("sha256")
    .update(await readFile(`${path}.before.y4m`))
    .digest("hex");
  const result = await optimizeFile(path);
  expect(result.status).toBe("optimized");
  execFileSync("avifdec", [path, `${path}.after.y4m`]);
  expect(
    createHash("sha256")
      .update(await readFile(`${path}.after.y4m`))
      .digest("hex")
  ).toBe(before);
});

test("retains EXIF when metadata stripping was not requested", async () => {
  const workspace = await createApiWorkspace();
  const path = await copyApiFixtureToWorkspace(
    getApiFixture("avif"),
    workspace
  );
  execFileSync("exiftool", [
    "-overwrite_original",
    "-Artist=Squeezit preservation fixture",
    path,
  ]);
  expect((await optimizeFile(path)).status).toBe("optimized");
  expect(
    execFileSync("exiftool", ["-s3", "-Artist", path]).toString().trim()
  ).toBe("Squeezit preservation fixture");
});
