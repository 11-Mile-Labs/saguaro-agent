import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { WorkflowService } from "../server.js";

function setupProject(): string {
  const root = mkdtempSync(resolve(tmpdir(), "saguaro-approval-gates-"));
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
    resolve(root, ".saguaro", "workflows", "engineering-standard.yaml"),
    `
name: engineering-standard
description: gated test workflow
version: 1.0.0
approval_gates:
  - after: da
    prompt: Approve the implementation plan before code changes?
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [intake_summary]
  - id: plan
    depends_on: [intake]
    agent: planner
    contract:
      inputs: [intake_summary]
      outputs: [implementation_plan]
  - id: da
    depends_on: [plan]
    agent: devils-advocate
    contract:
      inputs: [implementation_plan]
      outputs: [da_doc, approve]
  - id: implement
    depends_on: [da]
    agent: implementer
    contract:
      inputs: [implementation_plan, da_doc]
      outputs: [implementation_summary]
`,
    "utf8"
  );
  return root;
}

function createService(projectRoot: string): WorkflowService {
  return new WorkflowService({
    projectRoot,
    bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    env: {
      ...process.env,
      CODEX_HOME: "/tmp/codex-home",
      EMBEDDINGS_API_KEY: "test-embeddings",
      LLM_API_KEY: "test-llm",
    },
  });
}

async function completeThroughDa(service: WorkflowService, runId: string): Promise<void> {
  await service.workflowRecordArtifact({
    run_id: runId,
    phase_id: "intake",
    artifact: {
      content: "# Intake",
      outputs: { intake_summary: "Small enhancement" },
    },
  });
  await service.workflowRecordArtifact({
    run_id: runId,
    phase_id: "plan",
    artifact: {
      content: "# Plan",
      outputs: { implementation_plan: "Change one function" },
    },
  });
  await service.workflowRecordArtifact({
    run_id: runId,
    phase_id: "da",
    artifact: {
      content: "# DA",
      outputs: { da_doc: "Looks good", approve: true },
    },
  });
}

describe("approval gates", () => {
  test("refuses to dispatch while an approval gate is pending", async () => {
    const projectRoot = setupProject();
    const service = createService(projectRoot);
    const run = await service.workflowStart({
      name: "engineering-standard",
      args: { ticket_slug: "approval-gate-dispatch" },
    });

    await completeThroughDa(service, run.run_id);
    const result = await service.workflowDispatchPhase({ run_id: run.run_id });

    expect(result).toMatchObject({
      blocked: true,
      gate: { after: "da" },
    });

    const status = await service.workflowStatus({ run_id: run.run_id });
    expect(status.pending_phases).toContain("implement");
    expect(status.running_phases).not.toContain("implement");
  });

  test("phase output approve true does not clear an approval gate", async () => {
    const projectRoot = setupProject();
    const service = createService(projectRoot);
    const run = await service.workflowStart({
      name: "engineering-standard",
      args: { ticket_slug: "approval-gate-approve-output" },
    });

    await completeThroughDa(service, run.run_id);

    const blockedStatus = await service.workflowStatus({ run_id: run.run_id });
    expect(blockedStatus.pending_gates).toEqual([
      {
        after: "da",
        prompt: "Approve the implementation plan before code changes?",
      },
    ]);

    const approvedDispatch = await service.workflowDispatchPhase({
      run_id: run.run_id,
      approval_response: "approve",
    });
    const envelopes = (approvedDispatch as { envelopes?: Array<{ phase_id: string }> }).envelopes;
    expect(envelopes?.[0]?.phase_id).toBe("implement");
  });
});
