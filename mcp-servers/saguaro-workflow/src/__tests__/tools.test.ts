import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function writeDocsWorkflow(projectRoot: string): void {
  writeFileSync(
    resolve(projectRoot, ".saguaro", "workflows", "docs-quality.yaml"),
    `
name: docs-quality
description: docs artifact quality workflow
version: 1.0.0
phases:
  - id: docs
    agent: docs-writer
    contract:
      inputs: []
      outputs: [docs_summary]
`,
    "utf8"
  );
}

function longDocsArtifact(): string {
  const paragraph =
    "This documentation artifact explains the workflow behavior, operational impact, verification evidence, and follow-up guidance in complete markdown prose. ";
  return [
    "# Complete Documentation",
    "",
    "## Summary",
    paragraph.repeat(3),
    "## Implementation Notes",
    paragraph.repeat(3),
    "## Verification",
    paragraph.repeat(3),
    "## Follow-Up",
    paragraph.repeat(3),
  ].join("\n");
}

async function dispatchEngineeringStandardDa(
  service: WorkflowService,
  ticketSlug: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const started = await service.workflowStart({
    name: "engineering-standard",
    resume: false,
    args: {
      ticket_slug: ticketSlug,
      ticket_description: "Exercise the DA rubric envelope.",
      ...args,
    },
  });

  await service.workflowDispatchPhase({ run_id: started.run_id });
  await service.workflowRecordArtifact({
    run_id: started.run_id,
    phase_id: "intake",
    artifact: {
      content: "# Intake",
      outputs: {
        intake_summary: "DA rubric smoke",
        scope_class: "enhancement",
        acceptance_criteria: ["DA envelope contains rubric"],
      },
    },
  });

  await service.workflowDispatchPhase({ run_id: started.run_id });
  await service.workflowRecordArtifact({
    run_id: started.run_id,
    phase_id: "plan",
    artifact: {
      content: "# Plan",
      outputs: {
        research_findings: "DA phase needs the rubric.",
        architecture_doc: "Dispatch envelope owns phase instructions.",
        affected_areas: ["workflow envelope"],
        implementation_plan: "Add shared DA rubric helper.",
        verification_plan: "Dispatch DA and inspect contract.",
      },
    },
  });

  const dispatch = await service.workflowDispatchPhase({ run_id: started.run_id });
  const envelopes = (dispatch as { envelopes?: Array<{ phase_id: string; dispatch_contract: string }> }).envelopes;
  expect(envelopes?.[0]?.phase_id).toBe("da");
  return envelopes?.[0]?.dispatch_contract ?? "";
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
    expect(started.run_id).not.toBe("workflow-service-test");
    expect(started.resumed).toBe(false);

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

  test("auto-resumes incomplete runs by ticket_slug through workflow_start", async () => {
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

    const first = await service.workflowStart({
      name: "engineering",
      args: { ticket_slug: "resume-service-test" },
    });

    await service.workflowRecordArtifact({
      run_id: first.run_id,
      phase_id: "intake",
      artifact: {
        content: "# Intake",
        outputs: { summary: "keep me" },
      },
    });

    const resumed = await service.workflowStart({
      name: "engineering",
      args: { ticket_slug: "resume-service-test" },
    });

    expect(resumed.resumed).toBe(true);
    expect(resumed.run_id).toBe(first.run_id);

    const found = await service.workflowFindRun({
      ticket_slug: "resume-service-test",
      workflow_name: "engineering",
    });
    expect(found.run?.run_id).toBe(first.run_id);
    expect(found.run?.completed_phases).toEqual(["intake"]);
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
    expect(started.run_id).not.toBe("product-workflow-smoke");

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

  test("devils-advocate dispatch includes rubric and generic host-check fallbacks", async () => {
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

    const contract = await dispatchEngineeringStandardDa(service, "da-rubric-fallback");

    expect(contract).toContain("7 Engineering Questions");
    expect(contract).toContain("Is this the simplest solution?");
    expect(contract).toContain("Does this respect the project architecture?");
    expect(contract).toContain("consistency with stated invariants and module boundaries");
    expect(contract).toContain("Have we checked what already exists?");
    expect(contract).toContain("search the codebase for existing equivalents before adding new code");
    expect(contract).toContain("Severity scale: Critical blocks implementation");
    expect(contract).toContain("CRITICAL_RISK maps to the existing block gate");
    expect(contract).toContain("requires explicit approval before implementation");
  });

  test("devils-advocate dispatch includes host-supplied architecture and reuse checks", async () => {
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

    const contract = await dispatchEngineeringStandardDa(service, "da-rubric-host-inputs", {
      architecture_checks: ["Keep workflow schema stable.", "Do not bake host paths into bundled workflows."],
      reuse_checks: "Reuse existing approval-gate semantics.",
    });

    expect(contract).toContain("- Keep workflow schema stable.");
    expect(contract).toContain("- Do not bake host paths into bundled workflows.");
    expect(contract).toContain("Reuse existing approval-gate semantics.");
  });

  test("starts from explicit workflow_path without listing or drifting on resume", async () => {
    const projectRoot = setupProject();
    const generatedPath = resolve(projectRoot, ".saguaro", "generated", "dynamic.yaml");
    mkdirSync(resolve(generatedPath, ".."), { recursive: true });
    writeFileSync(
      generatedPath,
      `
name: generated-dynamic
description: generated workflow
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
`,
      "utf8"
    );

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
    expect(listed.workflows.find((workflow) => workflow.name === "generated-dynamic")).toBeUndefined();

    const started = await service.workflowStart({
      name: "generated-dynamic",
      workflow_path: ".saguaro/generated/dynamic.yaml",
      args: { ticket_slug: "generated-path-ticket" },
    });

    expect(started.workflow_source).toEqual({
      source: "path",
      path: generatedPath,
    });

    writeFileSync(generatedPath, "not: [valid", "utf8");

    const resumed = await service.workflowStart({
      name: "generated-dynamic",
      workflow_path: ".saguaro/generated/dynamic.yaml",
      args: { ticket_slug: "generated-path-ticket" },
    });
    expect(resumed.resumed).toBe(true);
    expect(resumed.run_id).toBe(started.run_id);

    const persistedWorkflow = JSON.parse(
      readFileSync(resolve(projectRoot, ".saguaro", "runs", started.run_id, "_workflow.json"), "utf8")
    );
    expect(persistedWorkflow.description).toBe("generated workflow");
    expect(persistedWorkflow.phases[0]?.id).toBe("intake");

    const dispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const envelopes = (dispatch as {
      envelopes?: Array<{
        phase_id: string;
        outputs_required: string[];
        workflow_source?: { source: string; path: string };
      }>;
    }).envelopes;
    expect(envelopes?.[0]?.phase_id).toBe("intake");
    expect(envelopes?.[0]?.outputs_required).toEqual(["summary"]);
    expect(envelopes?.[0]?.workflow_source).toEqual({
      source: "path",
      path: generatedPath,
    });

    const status = await service.workflowStatus({ run_id: started.run_id });
    expect(status.workflow_source).toEqual({
      source: "path",
      path: generatedPath,
    });
  });

  test("rejects workflow_path when requested name differs from YAML name", async () => {
    const projectRoot = setupProject();
    const generatedPath = resolve(projectRoot, ".saguaro", "generated", "dynamic.yaml");
    mkdirSync(resolve(generatedPath, ".."), { recursive: true });
    writeFileSync(
      generatedPath,
      `
name: generated-dynamic
description: generated workflow
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
`,
      "utf8"
    );

    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    });

    await expect(
      service.workflowStart({
        name: "wrong-name",
        workflow_path: ".saguaro/generated/dynamic.yaml",
      })
    ).rejects.toThrow(/does not match workflow_path name/);
  });

  test("docs-writer dispatch requires full markdown in artifact.content", async () => {
    const projectRoot = setupProject();
    writeDocsWorkflow(projectRoot);
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    });

    const started = await service.workflowStart({
      name: "docs-quality",
      args: { ticket_slug: "docs-contract-test" },
    });
    const dispatch = await service.workflowDispatchPhase({
      run_id: started.run_id,
    });
    const envelopes = (dispatch as { envelopes?: Array<{ dispatch_contract: string }> }).envelopes;

    expect(envelopes?.[0]?.dispatch_contract).toContain("complete multi-section markdown prose");
    expect(envelopes?.[0]?.dispatch_contract).toContain("not a pointer, summary, or path");
    expect(envelopes?.[0]?.dispatch_contract).toContain("artifact.content");
    expect(envelopes?.[0]?.dispatch_contract).toContain("full markdown document");
  });

  test("rejects pointer-only complete docs-writer artifacts", async () => {
    const projectRoot = setupProject();
    writeDocsWorkflow(projectRoot);
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    });

    const started = await service.workflowStart({
      name: "docs-quality",
      args: { ticket_slug: "docs-pointer-test" },
    });

    await expect(
      service.workflowRecordArtifact({
        run_id: started.run_id,
        phase_id: "docs",
        artifact: {
          content: "See full artifact at .saguaro/runs/example/docs.md",
          outputs: { docs_summary: "Wrote docs." },
        },
      })
    ).rejects.toThrow(/full markdown prose/);
  });

  test("rejects undersized complete docs-writer artifacts", async () => {
    const projectRoot = setupProject();
    writeDocsWorkflow(projectRoot);
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    });

    const started = await service.workflowStart({
      name: "docs-quality",
      args: { ticket_slug: "docs-short-test" },
    });

    await expect(
      service.workflowRecordArtifact({
        run_id: started.run_id,
        phase_id: "docs",
        artifact: {
          content: "# Docs\n\nToo short.",
          outputs: { docs_summary: "Wrote docs." },
        },
      })
    ).rejects.toThrow(/1024 non-whitespace characters/);
  });

  test("records complete docs-writer artifacts with full markdown prose", async () => {
    const projectRoot = setupProject();
    writeDocsWorkflow(projectRoot);
    const service = new WorkflowService({
      projectRoot,
      bundledWorkflowsDir: resolve(projectRoot, "bundled-workflows"),
    });

    const started = await service.workflowStart({
      name: "docs-quality",
      args: { ticket_slug: "docs-full-test" },
    });

    const recorded = await service.workflowRecordArtifact({
      run_id: started.run_id,
      phase_id: "docs",
      artifact: {
        content: longDocsArtifact(),
        outputs: { docs_summary: "Wrote complete docs." },
      },
    });

    expect(readFileSync(recorded.written_path, "utf8")).toContain("# Complete Documentation");
  });
});
