import { describe, expect, test } from "vitest";

import { formatOptimizationResult } from "../../src/utils/console";

describe("optimization result formatting", () => {
  test("formats an optimized result relative to the supplied working directory", () => {
    const line = formatOptimizationResult(
      {
        filePath: "/workspace/assets/hero.png",
        label: "[PNG]",
        status: "optimized",
        originalSize: 2_000,
        optimizedSize: 1_000,
        savedBytes: 1_000,
      },
      "/workspace"
    );

    expect(line).toContain("assets/hero.png");
    expect(line).toContain("-50.0%");
    expect(line).toContain("2.0KB -> 1000B");
  });
});
