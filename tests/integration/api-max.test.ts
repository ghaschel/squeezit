import { describe } from "vitest";

import { defineApiMaxFormatTests } from "../helpers/api";
import { formatFixtures } from "../helpers/fixture-manifest";

describe("api max-profile integration", () => {
  for (const fixture of formatFixtures) {
    describe(`${fixture.format}: max profile`, () => {
      defineApiMaxFormatTests(
        fixture.format,
        fixture.format === "webp" ? { timeout: 15_000 } : undefined
      );
    });
  }
});
