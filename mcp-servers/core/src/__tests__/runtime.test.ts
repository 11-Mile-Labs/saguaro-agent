import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  appendDispatchLogEntry,
  createWorkflowRun,
  getEligiblePhases,
  loadSaguaroConfig,
  loadWorkflowRun,
  markGateApproved,
  recordPhaseArtifact,
  saveWorkflowRun,
  syncApprovalGates,
  resolveModelForHarness,
  type WorkflowDefinition,
} from "../index.js";

function setupProject(configBody: string): string {
  const root = mkdtempSync(resolve(tmpdir(), "saguaro-runtime-"));
  mkdirSync(resolve(root, ".saguaro"), { recursive: true });
  writeFileSync(resolve(root, ".saguaro", "config.yaml"), configBody, "utf8");
  return root;
}

const baseConfig = `
embeddings:
  url: https://example.com/v1
  model: text-embedding-3-small
  api_key_env: EMBEDDINGS_API_KEY
llm:
  url: https://example.com/v1
  api_key_env: LLM_API_KEY
  model: gpt-5.4
model_tiers:
  codex:
    standard: gpt-5-codex-medium
    deep: gpt-5-codex-high
    surgeon: gpt-5-codex-pro
`;

describe("workflow runtime", () => {
  test("dispatches parallel peers after an upstream phase completes", () => {
    const projectRoot = setupProject(baseConfig);
    const config = loadSaguaroConfig(projectRoot);
    const workflow: WorkflowDefinition = {
      name: "engineering",
      description: "engineering flow",
      version: "1.0.0",
      phases: [
        {
          id: "intake",
          agent: "general-purpose",
          contract: {
            inputs: [],
            outputs: [{ name: "summary", required: true }],
          },
        },
        {
          id: "research",
          depends_on: ["intake"],
          parallel_group: "analysis",
          agent: "explore",
          contract: {
            inputs: [{ name: "summary", required: true }],
            outputs: [{ name: "research_brief", required: true }],
            requires_memory_query: true,
          },
        },
        {
          id: "impact",
          depends_on: ["intake"],
          parallel_group: "analysis",
          agent: "impact-analyzer",
          contract: {
            inputs: [{ name: "summary", required: true }],
            outputs: [{ name: "impact_doc", required: true }],
          },
        },
      ],
    };

    const run = createWorkflowRun(config, workflow, { ticket_slug: "parallel-test" });
    expect(getEligiblePhases(workflow, run.status).map((phase) => phase.id)).toEqual(["intake"]);

    recordPhaseArtifact(workflow, run.status, {
      phaseId: "intake",
      path: resolve(run.runDir, "intake.md"),
      artifactStatus: "complete",
      outputs: { summary: "done" },
    });

    expect(getEligiblePhases(workflow, run.status).map((phase) => phase.id)).toEqual([
      "research",
      "impact",
    ]);
  });

  test("surfaces triggered approval gates and can clear them", () => {
    const projectRoot = setupProject(baseConfig);
    const config = loadSaguaroConfig(projectRoot);
    const workflow: WorkflowDefinition = {
      name: "gated",
      description: "gated flow",
      version: "1.0.0",
      approval_gates: [{ after: "da", prompt: "Approve architecture?" }],
      phases: [
        {
          id: "da",
          agent: "devils-advocate",
          contract: { inputs: [], outputs: [{ name: "approve", required: true }] },
        },
        {
          id: "implement",
          depends_on: ["da"],
          agent: "implementer",
          contract: {
            inputs: [{ name: "approve", required: true }],
            outputs: [{ name: "result", required: true }],
          },
        },
      ],
    };

    const run = createWorkflowRun(config, workflow, { ticket_slug: "gate-test" });
    recordPhaseArtifact(workflow, run.status, {
      phaseId: "da",
      path: resolve(run.runDir, "da.md"),
      artifactStatus: "complete",
      outputs: { approve: true },
    });

    syncApprovalGates(run.status, workflow);
    expect(run.status.approval_gates_pending).toEqual([
      { after: "da", prompt: "Approve architecture?" },
    ]);

    markGateApproved(run.status, "da");
    expect(run.status.approval_gates_pending).toEqual([]);
    expect(run.status.approved_gates).toContain("da");
  });

  test("reads dispatch logs for memory and knowledge validation", () => {
    const projectRoot = setupProject(baseConfig);
    const config = loadSaguaroConfig(projectRoot);
    const workflow: WorkflowDefinition = {
      name: "research",
      description: "research flow",
      version: "1.0.0",
      phases: [
        {
          id: "research",
          agent: "explore",
          contract: {
            inputs: [],
            outputs: [{ name: "research_brief", required: true }],
            requires_memory_query: true,
            requires_knowledge_query: true,
          },
        },
      ],
    };

    const run = createWorkflowRun(config, workflow, { ticket_slug: "log-test" });
    appendDispatchLogEntry({
      runDir: run.runDir,
      runId: run.status.run_id,
      phaseId: "research",
      server: "saguaro-memory",
      tool: "memory_retrieve",
      args: { query: "auth" },
      durationMs: 10,
      ok: true,
    });
    appendDispatchLogEntry({
      runDir: run.runDir,
      runId: run.status.run_id,
      phaseId: "research",
      server: "saguaro-knowledge",
      tool: "knowledge_query",
      args: { prompt: "auth history" },
      durationMs: 20,
      ok: true,
    });

    saveWorkflowRun(config, run);
    const loaded = loadWorkflowRun(config, run.status.run_id);
    expect(loaded.status.run_id).toBe(run.status.run_id);
  });

  test("loads the config shape written by saguaro init", () => {
    const projectRoot = setupProject(`
embeddings:
  base_url: http://localhost:1234/v1
  model: text-embedding-bge-m3
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: http://localhost:3001/v1
  model: local-llm
  api_key_env: LLM_API_KEY
  temperature: 0
redaction:
  enabled: true
  disabled_rules: ""
  additional_allow_patterns: ""
memory:
  collection: saguaro_memory
knowledge:
  collection: saguaro_knowledge
  chunk_size: 900
workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
`);

    const config = loadSaguaroConfig(projectRoot);
    expect(config.config.embeddings.base_url).toBe("http://localhost:1234/v1");
    expect(config.config.llm?.api_key_env).toBe("LLM_API_KEY");
    expect(config.config.memory?.collection).toBe("saguaro_memory");
    expect(config.config.knowledge?.chunk_size).toBe(900);
  });

  test("allows endpoint and model values to resolve from environment", () => {
    const projectRoot = setupProject(`
embeddings:
  api_key_env: EMBEDDINGS_API_KEY
llm:
  api_key_env: LLM_API_KEY
  temperature: 0
memory:
  collection: saguaro_memory
knowledge:
  collection: saguaro_knowledge
workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
`);

    const config = loadSaguaroConfig(projectRoot);
    expect(config.config.embeddings.base_url).toBeUndefined();
    expect(config.config.embeddings.model).toBeUndefined();
    expect(config.config.llm?.base_url).toBeUndefined();
    expect(config.config.llm?.model).toBeUndefined();
  });

  test("parses a config containing the documented storage block without error", () => {
    const projectRoot = setupProject(`
embeddings:
  base_url: "https://api.openai.com/v1"
  model: "text-embedding-3-small"
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: "https://api.openai.com/v1"
  model: "gpt-5.4"
  api_key_env: LLM_API_KEY
  temperature: 0
storage:
  backend: chromadb
  vector_store_base_url: http://localhost:8000
`);

    const config = loadSaguaroConfig(projectRoot);
    expect(config.config.storage?.backend).toBe("chromadb");
    expect(config.config.storage?.vector_store_base_url).toBe("http://localhost:8000");
  });

  test("resolves harness-specific model tiers", () => {
    const projectRoot = setupProject(baseConfig);
    const { config } = loadSaguaroConfig(projectRoot);

    expect(resolveModelForHarness(config, "codex", "standard")).toBe("gpt-5-codex-medium");
    expect(resolveModelForHarness(config, "codex", "deep")).toBe("gpt-5-codex-high");
    expect(resolveModelForHarness(config, "codex", "surgeon")).toBe("gpt-5-codex-pro");
    expect(resolveModelForHarness(config, "unknown", "standard")).toBeNull();
  });
});
