import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api apng integration", () => {
  defineApiFormatTests("apng");
});

import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { optimizeFile } from "../../src/api";
import { hasApngAnimation } from "../../src/utils/optimizer";
import {
  copyApiFixtureToWorkspace,
  createApiWorkspace,
  getApiFixture,
} from "../helpers/api";

test("metadata stripping preserves APNG animation frames", async () => {
  const workspace = await createApiWorkspace();
  const path = await copyApiFixtureToWorkspace(
    getApiFixture("apng"),
    workspace
  );
  const controls = (bytes: Buffer): Buffer[] => {
    const result: Buffer[] = [];
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (type === "acTL" || type === "fcTL")
        result.push(
          bytes.subarray(
            offset + 8 + (type === "fcTL" ? 4 : 0),
            offset + 8 + size
          )
        );
      offset += 12 + size;
    }
    return result;
  };
  const before = await readFile(path);
  expect(hasApngAnimation(before)).toBe(true);
  const result = await optimizeFile(path, { stripMetadata: true });
  expect(result.status).toBe("optimized");
  const after = await readFile(path);
  expect(hasApngAnimation(after)).toBe(true);
  expect(controls(after)).toEqual(controls(before));
});
