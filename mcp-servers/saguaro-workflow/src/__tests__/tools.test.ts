import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { WorkflowService } from "../server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const bundledWorkflowsDir = resolve(repoRoot, "workflows");

function setupProject(): string {
  const root = mkdtempSync(resolve(tmpdir(), "saguaro-workflow-service-"));
  mkdirSync(resolve(root, ".saguaro", "workflows"), { recursive: true });
  writeFileSync(
    resolve(root, ".saguaro", "config.yaml"),
    `
embeddings:
  base_url: https://example.com/v1
  model: text-embedding-3-small
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: https://example.com/v1
  model: local-chat
  api_key_env: LLM_API_KEY
model_tiers:
  codex:
    standard: gpt-5-codex-medium
    deep: gpt-5-codex-high
    surgeon: gpt-5-codex-pro
`,
    "utf8"
  );
  writeFileSync(
    resolve(root, ".saguaro", "workflows", "engineering.yaml"),
    `
name: engineering
description: local workflow
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
  - id: research
    depends_on: [intake]
    agent: explore
    contract:
      inputs: [summary]
      outputs: [research_brief]
      requires_memory_query: true
`,
    "utf8"
  );
  return root;
}

describe("WorkflowService", () => {
  test("starts, dispatches, validates, and records a workflow phase", async () => {
    const projectRoot = setupProject();
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
      env: {
        ...process.env,
        CODEX_HOME: "/tmp/codex-home",
        EMBEDDINGS_API_KEY: "test-embeddings",
        LLM_API_KEY: "test-llm",
      },
    });

    const listed = await service.workflowList();
    expect(listed.workflows).toHaveLength(1);

    const started = await service.workflowStart({
      name: "engineering",
      args: { ticket_slug: "workflow-service-test" },
    });
    expect(started.run_id).toBe("workflow-service-test");

    const firstDispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const firstEnvelopes = (firstDispatch as { envelopes?: Array<{ phase_id: string }> }).envelopes;
    expect(Array.isArray(firstEnvelopes)).toBe(true);
    if (!Array.isArray(firstEnvelopes)) {
      throw new Error("Expected dispatch envelopes for intake.");
    }
    expect(firstEnvelopes[0].phase_id).toBe("intake");

    await service.workflowRecordArtifact({
      run_id: started.run_id,
      phase_id: "intake",
      artifact: {
        content: "# Intake",
        outputs: { summary: "auth ticket" },
      },
    });

    const secondDispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const secondEnvelopes = (secondDispatch as { envelopes?: Array<{ phase_id: string }> }).envelopes;
    expect(Array.isArray(secondEnvelopes)).toBe(true);
    if (!Array.isArray(secondEnvelopes)) {
      throw new Error("Expected dispatch envelopes for research.");
    }
    expect(secondEnvelopes[0].phase_id).toBe("research");

    const invalid = await service.workflowValidateOutput({
      run_id: started.run_id,
      phase_id: "research",
      output_envelope: {
        outputs: { research_brief: "found it" },
      },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.missing_tool_calls).toEqual(["memory_retrieve"]);

    const redispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const redispatchEnvelopes = (redispatch as { envelopes?: Array<{ phase_id: string }> }).envelopes;
    expect(redispatchEnvelopes?.[0]?.phase_id).toBe("research");

    const info = await service.workflowRuntimeInfo();
    expect(info.harness).toBe("codex");
    expect(info.embeddings_ok).toBe(true);
    expect(info.llm_ok).toBe(true);
  });

  test("lists bundled product workflow and dispatches through product-spec", async () => {
    const projectRoot = setupProject();
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir,
      env: {
        ...process.env,
        CODEX_HOME: "/tmp/codex-home",
        EMBEDDINGS_API_KEY: "test-embeddings",
        LLM_API_KEY: "test-llm",
      },
    });

    const listed = await service.workflowList();
    const product = listed.workflows.find((workflow) => workflow.name === "product");
    expect(product).toMatchObject({ name: "product", source: "bundled" });

    const started = await service.workflowStart({
      name: "product",
      args: {
        ticket_slug: "product-workflow-smoke",
        ticket_description: "Add onboarding checklist for new projects.",
      },
    });
    expect(started.run_id).toBe("product-workflow-smoke");

    const intakeDispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const intakeEnvelopes = (intakeDispatch as { envelopes?: Array<{ phase_id: string }> }).envelopes;
    expect(intakeEnvelopes?.[0]?.phase_id).toBe("intake");

    await service.workflowRecordArtifact({
      run_id: started.run_id,
      phase_id: "intake",
      artifact: {
        content: "# Intake",
        outputs: {
          intake_summary: "Onboarding checklist feature",
          scope_class: "feature",
          research_targets: "examples/, docs/getting-started.md",
        },
      },
    });

    const productSpecDispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const productSpecEnvelopes = (productSpecDispatch as {
      envelopes?: Array<{ phase_id: string; outputs_required: string[] }>;
    }).envelopes;
    expect(productSpecEnvelopes?.[0]?.phase_id).toBe("product-spec");
    expect(productSpecEnvelopes?.[0]?.outputs_required).toEqual(
      expect.arrayContaining([
        "user_stories",
        "acceptance_criteria",
        "in_scope",
        "out_of_scope",
        "product_spec_summary",
      ])
    );
  });
});
