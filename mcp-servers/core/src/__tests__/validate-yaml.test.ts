import { describe, expect, test } from "vitest";
import { validateWorkflowDefinition } from "../workflow/types.js";

describe("validateWorkflowDefinition", () => {
  test("recognizes planner as a portable workflow agent", () => {
    const result = validateWorkflowDefinition({
      name: "planner-agent",
      description: "workflow with a composite planning phase",
      version: "1.0.0",
      phases: [
        {
          id: "plan",
          agent: "planner",
          contract: { inputs: [], outputs: ["implementation_plan"] },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("rejects dependency cycles", () => {
    const result = validateWorkflowDefinition({
      name: "cyclic",
      description: "bad workflow",
      version: "1.0.0",
      phases: [
        {
          id: "a",
          depends_on: ["b"],
          agent: "general-purpose",
          contract: { inputs: [], outputs: ["a_out"] },
        },
        {
          id: "b",
          depends_on: ["a"],
          agent: "general-purpose",
          contract: { inputs: [], outputs: ["b_out"] },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("Dependency cycle"))).toBe(true);
  });

  test("rejects inconsistent parallel groups", () => {
    const result = validateWorkflowDefinition({
      name: "parallel-mismatch",
      description: "bad workflow",
      version: "1.0.0",
      phases: [
        {
          id: "intake",
          agent: "general-purpose",
          contract: { inputs: [], outputs: ["summary"] },
        },
        {
          id: "research",
          depends_on: ["intake"],
          parallel_group: "analysis",
          agent: "explore",
          contract: { inputs: [], outputs: ["brief"] },
        },
        {
          id: "impact",
          depends_on: [],
          parallel_group: "analysis",
          agent: "impact-analyzer",
          contract: { inputs: [], outputs: ["impact"] },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) =>
        issue.message.includes("must share the same depends_on set")
      )
    ).toBe(true);
  });

  test("accepts v1 workflows on later v1 engines and rejects newer major workflows", () => {
    const workflow = {
      name: "compat",
      description: "compatibility check",
      version: "1.0.0",
      phases: [
        {
          id: "intake",
          agent: "general-purpose",
          contract: { inputs: [], outputs: ["summary"] },
        },
      ],
    };

    expect(validateWorkflowDefinition(workflow, { engineVersion: "1.5.0" }).valid).toBe(true);

    const rejected = validateWorkflowDefinition({
      ...workflow,
      version: "2.0.0",
    }, { engineVersion: "1.5.0" });
    expect(rejected.valid).toBe(false);
    expect(rejected.errors.some((issue) => issue.message.includes("exceeds engine major version"))).toBe(true);
  });
});
