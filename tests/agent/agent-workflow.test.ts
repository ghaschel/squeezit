import { describe, expect, test } from "vitest";

import {
  type AgentCapability,
  type AgentWorkflowAction,
  evaluateAgentWorkflow,
} from "../../scripts/agent-workflow-evaluator";

const capabilities: AgentCapability[] = [
  {
    confirmation: { requiredWhen: "never" },
    effects: ["reads-cli-metadata"],
    id: "capabilities",
  },
  {
    confirmation: { requiredWhen: "never" },
    effects: ["reads-environment"],
    id: "doctor",
  },
  {
    confirmation: {
      requiredWhen: "writes-files-in-json-events-or-non-interactive-mode",
    },
    effects: ["writes-files"],
    id: "compress",
  },
  {
    confirmation: { requiredWhen: "never" },
    effects: ["reads-files", "writes-plan-artifact"],
    id: "plan compress",
  },
  {
    confirmation: { requiredWhen: "always-requires-yes" },
    effects: ["writes-files"],
    id: "plan apply",
  },
];

describe("deterministic agent workflow evaluation", () => {
  test("accepts a discovered, checked, previewed, and reviewed apply workflow", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "capabilities", "--json"]),
      action(["sqz", "doctor", "--json"]),
      action(["sqz", "compress", "asset.png", "--dry-run", "--json"], {
        sourceFingerprint: { after: "abc", before: "abc" },
      }),
      action([
        "sqz",
        "plan",
        "compress",
        "asset.png",
        "--output",
        ".squeezit/asset.plan.json",
        "--json",
      ]),
      action([
        "sqz",
        "plan",
        "apply",
        ".squeezit/asset.plan.json",
        "--yes",
        "--json",
      ]),
    ]);

    expect(result).toEqual({ ok: true, violations: [] });
  });

  test("rejects an image operation that skipped capabilities and doctor", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "compress", "asset.png", "--dry-run", "--json"]),
    ]);

    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["CAPABILITIES_NOT_DISCOVERED", "DOCTOR_NOT_RUN"])
    );
  });

  test("rejects a dry run that changed its source", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "capabilities", "--json"]),
      action(["sqz", "doctor", "--json"]),
      action(["sqz", "compress", "asset.png", "--dry-run", "--json"], {
        sourceFingerprint: { after: "changed", before: "original" },
      }),
    ]);

    expect(result.violations.map((violation) => violation.code)).toContain(
      "DRY_RUN_MUTATED_INPUT"
    );
  });

  test("rejects applying an unknown plan or any mutation without yes", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "capabilities", "--json"]),
      action(["sqz", "doctor", "--json"]),
      action(["sqz", "plan", "apply", "missing.plan.json", "--json"]),
    ]);

    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["CONFIRMATION_MISSING", "PLAN_NOT_REVIEWED"])
    );
  });

  test("rejects direct image mutation without a dry-run or reviewed plan", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "capabilities", "--json"]),
      action(["sqz", "doctor", "--json"]),
      action(["sqz", "compress", "asset.png", "--yes", "--json"]),
    ]);

    expect(result.violations.map((violation) => violation.code)).toContain(
      "PREVIEW_OR_PLAN_REQUIRED"
    );
  });

  test("stops an unsafe follow-up after a typed command failure", () => {
    const result = evaluateAgentWorkflow(capabilities, [
      action(["sqz", "capabilities", "--json"]),
      action(["sqz", "doctor", "--json"]),
      action(["sqz", "compress", "asset.png", "--dry-run", "--json"], {
        errorCode: "DEPENDENCY_MISSING",
      }),
      action([
        "sqz",
        "plan",
        "apply",
        ".squeezit/asset.plan.json",
        "--yes",
        "--json",
      ]),
    ]);

    expect(result.violations.map((violation) => violation.code)).toContain(
      "FAILURE_IGNORED"
    );
  });
});

function action(
  argv: string[],
  result: AgentWorkflowAction["result"] = {}
): AgentWorkflowAction {
  return { argv, result };
}
