import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createOptimizationPlan,
  fingerprintFile,
  readOptimizationPlan,
  verifyOptimizationPlan,
  verifyPlanInput,
  writeOptimizationPlan,
} from "../../src/cli/optimization-plan";
import type { ResolvedInput } from "../../src/types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("optimization plan artifacts", () => {
  test("hashes file contents with its byte size", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    await writeFile(input, "first image bytes");

    expect(await fingerprintFile(input)).toEqual({
      algorithm: "sha256",
      digest:
        "13f6f3a85aebee71c6d4917d4dabe816808098d1bf0fb24aa1bef22a5799f380",
      size: 17,
    });
  });

  test("writes and reads a digest-protected plan without overwriting it", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    const output = join(directory, "plans", "compress.json");
    await writeFile(input, "first image bytes");
    const plan = await createPlan(input);

    await writeOptimizationPlan(output, plan);

    expect(await readOptimizationPlan(output)).toEqual(plan);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({
      kind: "squeezit-optimization-plan",
      planDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    await expect(writeOptimizationPlan(output, plan)).rejects.toMatchObject({
      code: "PLAN_OUTPUT_EXISTS",
    });
  });

  test("atomically gives exactly one concurrent writer ownership of an output path", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    const output = join(directory, "compress.json");
    await writeFile(input, "first image bytes");
    const plan = await createPlan(input);

    const writes = await Promise.allSettled([
      writeOptimizationPlan(output, plan),
      writeOptimizationPlan(output, plan),
    ]);

    expect(
      writes.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(writes.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "PLAN_OUTPUT_EXISTS" }),
      }),
    ]);
  });

  test("uses a canonical digest independent of semantic object key ordering", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    await writeFile(input, "first image bytes");
    const first = await createPlan(input);
    const second = await createOptimizationPlan({
      createdAt: "2026-08-17T12:00:00.000Z",
      inputs: [resolvedInput(input)],
      operation: "compress",
      options: {
        threshold: 100,
        stripMeta: false,
        max: false,
        keepTime: false,
        inPlace: false,
        exifOnly: false,
        concurrency: 1,
      },
      runtime: {
        squeezitVersion: "2.0.7",
        platform: "darwin-arm64",
        nodeVersion: "24.16.0",
        cwd: "/workspace",
      },
      tools: [
        {
          rawVersion: "oxipng 10.1.0",
          provider: "brew",
          normalizedVersion: "10.1.0",
          minimumVersion: "10.1.0",
          binary: "oxipng",
        },
      ],
    });

    expect(second.planDigest).toBe(first.planDigest);
  });

  test("rejects an artifact changed after its digest was created", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    const output = join(directory, "compress.json");
    await writeFile(input, "first image bytes");
    const plan = await createPlan(input);
    await writeOptimizationPlan(output, plan);
    const artifact = JSON.parse(await readFile(output, "utf8")) as Record<
      string,
      unknown
    >;
    artifact.operation = "metadata strip";
    await writeFile(output, `${JSON.stringify(artifact)}\n`);

    await expect(readOptimizationPlan(output)).rejects.toMatchObject({
      code: "PLAN_INVALID",
    });
  });

  test("reports exact runtime, tool, and input mismatches before apply", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    await writeFile(input, "first image bytes");
    const plan = await createPlan(input);
    const [tool] = plan.tools;
    if (!tool) throw new Error("Expected the plan fixture to include oxipng.");

    await expect(
      verifyOptimizationPlan({
        plan,
        runtime: { ...runtime(), squeezitVersion: "2.1.0" },
        tools: plan.tools,
      })
    ).rejects.toMatchObject({ code: "PLAN_RUNTIME_CHANGED" });
    await expect(
      verifyOptimizationPlan({
        plan,
        runtime: runtime(),
        tools: [
          {
            ...tool,
            normalizedVersion: "999.0.0",
          },
        ],
      })
    ).rejects.toMatchObject({ code: "PLAN_TOOL_CHANGED" });

    await writeFile(input, "different image bytes");

    await expect(
      verifyOptimizationPlan({
        plan,
        runtime: runtime(),
        tools: plan.tools,
      })
    ).rejects.toMatchObject({
      code: "PLAN_INPUT_CHANGED",
      details: { paths: [input] },
    });
  });

  test("rejects an individual input whose fingerprint changes during apply", async () => {
    const directory = await createTemporaryDirectory();
    const input = join(directory, "image.png");
    await writeFile(input, "first image bytes");
    const plan = await createPlan(input);
    const [plannedInput] = plan.inputs;
    if (!plannedInput)
      throw new Error("Expected the plan fixture to include an input.");

    await writeFile(input, "changed during apply");

    await expect(verifyPlanInput(plannedInput)).rejects.toMatchObject({
      code: "PLAN_INPUT_CHANGED",
      details: { paths: [input] },
    });
  });
});

async function createPlan(input: string) {
  return createOptimizationPlan({
    inputs: [resolvedInput(input)],
    operation: "compress",
    options: {
      concurrency: 1,
      exifOnly: false,
      inPlace: false,
      keepTime: false,
      max: false,
      stripMeta: false,
      threshold: 100,
    },
    runtime: runtime(),
    tools: [
      {
        binary: "oxipng",
        minimumVersion: "10.1.0",
        normalizedVersion: "10.1.0",
        provider: "brew",
        rawVersion: "oxipng 10.1.0",
      },
    ],
    createdAt: "2026-08-17T12:00:00.000Z",
  });
}

function resolvedInput(absolutePath: string): ResolvedInput {
  return { absolutePath, displayPath: "image.png" };
}

function runtime() {
  return {
    cwd: "/workspace",
    nodeVersion: "24.16.0",
    platform: "darwin-arm64",
    squeezitVersion: "2.0.7",
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "squeezit-plan-"));
  temporaryDirectories.push(directory);
  return directory;
}
