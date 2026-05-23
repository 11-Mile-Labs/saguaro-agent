import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  createWorkflowRun,
  findIncompleteRun,
  findIndexedRun,
  getTicketIndexPath,
  loadSaguaroConfig,
  loadWorkflowRun,
  markGateApproved,
  recordPhaseArtifact,
  saveWorkflowRun,
  startOrResumeWorkflowRun,
  syncApprovalGates,
  type WorkflowDefinition,
} from "../index.js";

function setupProject(): string {
  const root = mkdtempSync(resolve(tmpdir(), "saguaro-run-index-"));
  mkdirSync(resolve(root, ".saguaro"), { recursive: true });
  writeFileSync(
    resolve(root, ".saguaro", "config.yaml"),
    `
embeddings:
  url: https://example.com/v1
  model: text-embedding-3-small
  api_key_env: EMBEDDINGS_API_KEY
llm:
  url: https://example.com/v1
  api_key_env: LLM_API_KEY
  model: gpt-5.4
`,
    "utf8"
  );
  return root;
}

const workflow: WorkflowDefinition = {
  name: "engineering-lite",
  description: "lite",
  version: "1.0.0",
  approval_gates: [{ after: "da", prompt: "Approve plan?" }],
  phases: [
    {
      id: "intake",
      agent: "general-purpose",
      contract: { inputs: [], outputs: [{ name: "summary", required: true }] },
    },
    {
      id: "da",
      depends_on: ["intake"],
      agent: "devils-advocate",
      contract: { inputs: [{ name: "summary", required: true }], outputs: [{ name: "approve", required: true }] },
    },
    {
      id: "implement",
      depends_on: ["da"],
      agent: "implementer",
      contract: { inputs: [{ name: "approve", required: true }], outputs: [{ name: "result", required: true }] },
    },
  ],
};

describe("workflow run index and resume", () => {
  test("creates opaque run ids and indexes by ticket_slug", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);

    const started = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "resume-ticket" });
    expect(started.resumed).toBe(false);
    expect(started.run.status.run_id).not.toBe("resume-ticket");
    expect(started.run.status.run_id).toMatch(/^engineering-lite-/);

    const indexPath = getTicketIndexPath(config, "engineering-lite", "resume-ticket");
    expect(existsSync(indexPath)).toBe(true);
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    expect(index.run_id).toBe(started.run.status.run_id);
  });

  test("auto-resumes an incomplete run without wiping state", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);

    const first = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "same-ticket" });
    recordPhaseArtifact(workflow, first.run.status, {
      phaseId: "intake",
      path: resolve(first.run.runDir, "intake.md"),
      artifactStatus: "complete",
      outputs: { summary: "partial progress" },
    });
    saveWorkflowRun(config, first.run);

    const second = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "same-ticket" });
    expect(second.resumed).toBe(true);
    expect(second.run.status.run_id).toBe(first.run.status.run_id);
    expect(second.run.status.completed_phases).toEqual(["intake"]);
    expect(second.run.status.pending_phases).toEqual(["da", "implement"]);
  });

  test("resumes with a pending approval gate intact", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);

    const first = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "gate-ticket" });
    recordPhaseArtifact(workflow, first.run.status, {
      phaseId: "intake",
      path: resolve(first.run.runDir, "intake.md"),
      artifactStatus: "complete",
      outputs: { summary: "ready for da" },
    });
    recordPhaseArtifact(workflow, first.run.status, {
      phaseId: "da",
      path: resolve(first.run.runDir, "da.md"),
      artifactStatus: "complete",
      outputs: { approve: true },
    });
    syncApprovalGates(first.run.status, workflow);
    saveWorkflowRun(config, first.run);
    expect(first.run.status.approval_gates_pending).toHaveLength(1);

    const resumed = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "gate-ticket" });
    expect(resumed.resumed).toBe(true);
    expect(resumed.run.status.approval_gates_pending[0]?.after).toBe("da");
  });

  test("creates a new run after completion when resume is auto", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);

    const first = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "done-ticket" });
    first.run.status.completed_at = new Date().toISOString();
    first.run.status.pending_phases = [];
    saveWorkflowRun(config, first.run);

    const second = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "done-ticket" });
    expect(second.resumed).toBe(false);
    expect(second.run.status.run_id).not.toBe(first.run.status.run_id);
  });

  test("isolates runs by workflow_name for the same ticket slug", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);
    const otherWorkflow: WorkflowDefinition = { ...workflow, name: "engineering-standard" };

    const lite = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "shared-slug" });
    const standard = startOrResumeWorkflowRun(config, otherWorkflow, { ticket_slug: "shared-slug" });

    expect(lite.run.status.run_id).not.toBe(standard.run.status.run_id);
    expect(findIncompleteRun(config, "engineering-lite", "shared-slug")?.status.run_id).toBe(
      lite.run.status.run_id
    );
    expect(findIncompleteRun(config, "engineering-standard", "shared-slug")?.status.run_id).toBe(
      standard.run.status.run_id
    );
  });

  test("resume true errors when no incomplete run exists", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);

    expect(() =>
      startOrResumeWorkflowRun(config, workflow, { ticket_slug: "missing" }, { resume: true })
    ).toThrow(/No incomplete run/);
  });

  test("findIndexedRun can include completed runs", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);
    const started = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "completed-index" });
    started.run.status.completed_at = new Date().toISOString();
    started.run.status.pending_phases = [];
    saveWorkflowRun(config, started.run);

    expect(findIndexedRun(config, "engineering-lite", "completed-index")).toBeNull();
    expect(
      findIndexedRun(config, "engineering-lite", "completed-index", { includeCompleted: true })
        ?.run.status.run_id
    ).toBe(started.run.status.run_id);
  });

  test("clears approval gate on resumed run after approval", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);
    const first = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "approve-resume" });
    recordPhaseArtifact(workflow, first.run.status, {
      phaseId: "intake",
      path: resolve(first.run.runDir, "intake.md"),
      artifactStatus: "complete",
      outputs: { summary: "ok" },
    });
    recordPhaseArtifact(workflow, first.run.status, {
      phaseId: "da",
      path: resolve(first.run.runDir, "da.md"),
      artifactStatus: "complete",
      outputs: { approve: true },
    });
    syncApprovalGates(first.run.status, workflow);
    markGateApproved(first.run.status, "da");
    saveWorkflowRun(config, first.run);

    const resumed = startOrResumeWorkflowRun(config, workflow, { ticket_slug: "approve-resume" });
    expect(resumed.run.status.approval_gates_pending).toEqual([]);
    expect(resumed.run.status.approved_gates).toContain("da");
  });

  test("loads explicit run_id when provided", () => {
    const projectRoot = setupProject();
    const config = loadSaguaroConfig(projectRoot);
    const created = createWorkflowRun(config, workflow, { ticket_slug: "explicit" }, "custom-run-id");
    const loaded = startOrResumeWorkflowRun(
      config,
      workflow,
      { ticket_slug: "explicit" },
      { runId: "custom-run-id" }
    );
    expect(loaded.resumed).toBe(true);
    expect(loaded.run.status.run_id).toBe(created.status.run_id);
    expect(loadWorkflowRun(config, "custom-run-id").status.run_id).toBe("custom-run-id");
  });
});
