import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appendDispatchLogEntry,
  artifactPathForPhase,
  buildWorkflowLayers,
  detectHarness,
  discoverWorkflows,
  findIndexedRun,
  generateWorkflowEnvelope,
  getEligiblePhases,
  getRunDir,
  getTriggeredApprovalGate,
  getWorkflowByName,
  getWorkflowPhase,
  loadSaguaroConfig,
  loadWorkflowRun,
  markGateApproved,
  readDispatchLogEntries,
  recordPhaseArtifact,
  resolveInputValues,
  resolvePhaseDefaults,
  saveWorkflowRun,
  startOrResumeWorkflowRun,
  syncApprovalGates,
  updateValidationFailure,
  validateEnvelopeAgainstPhase,
  validateWorkflowYamlFile,
  llmApiKeyEnv,
  type HarnessName,
  type LoadedSaguaroConfig,
  type WorkflowArtifactRecord,
  type WorkflowDispatchEnvelope,
  type WorkflowResumeMode,
  type WorkflowRunStatus,
} from "@11-mile-labs/saguaro-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface WorkflowServiceOptions {
  projectRoot?: string;
  bundledWorkflowsDir?: string;
  env?: NodeJS.ProcessEnv;
}

type ArtifactPayload = {
  content?: string;
  outputs?: Record<string, unknown>;
  format?: "md" | "json" | "txt";
  metadata?: Record<string, unknown>;
};

export class WorkflowService {
  private readonly projectRoot?: string;

  private readonly bundledWorkflowsDir: string;

  private readonly env: NodeJS.ProcessEnv;

  constructor(options: WorkflowServiceOptions = {}) {
    this.projectRoot = options.projectRoot;
    this.env = options.env ?? process.env;
    this.bundledWorkflowsDir =
      options.bundledWorkflowsDir ??
      this.env.SAGUARO_BUNDLED_WORKFLOWS_DIR ??
      resolve(new URL("../../..", import.meta.url).pathname, "workflows");
  }

  private getLoadedConfig(projectPath?: string): LoadedSaguaroConfig {
    return loadSaguaroConfig(projectPath ?? this.projectRoot);
  }

  private getHarness(): HarnessName {
    return detectHarness(this.env);
  }

  private getWorkflowCatalog(loadedConfig: LoadedSaguaroConfig) {
    return discoverWorkflows({
      projectRoot: loadedConfig.projectRoot,
      projectWorkflowsDir: resolve(loadedConfig.projectRoot, loadedConfig.config.workflows_dir),
      bundledWorkflowsDir: this.bundledWorkflowsDir,
      engineVersion: "1.0.0",
    });
  }

  private logToolIfRunScoped(args: {
    loadedConfig: LoadedSaguaroConfig;
    runId?: string;
    phaseId?: string | null;
    tool: string;
    payload: unknown;
    durationMs: number;
    ok: boolean;
  }): void {
    if (!args.runId) {
      return;
    }
    appendDispatchLogEntry({
      runDir: getRunDir(args.loadedConfig, args.runId),
      runId: args.runId,
      phaseId: args.phaseId ?? null,
      server: "saguaro-workflow",
      tool: args.tool,
      args: args.payload,
      durationMs: args.durationMs,
      ok: args.ok,
    });
  }

  async workflowList(args: { project_path?: string } = {}) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const catalog = this.getWorkflowCatalog(loadedConfig);
    return {
      workflows: catalog.workflows.map((workflow) => ({
        name: workflow.name,
        description: workflow.description,
        source: workflow.source,
        path: workflow.path,
      })),
    };
  }

  async workflowStart(args: {
    name: string;
    args?: Record<string, unknown>;
    resume?: WorkflowResumeMode;
    run_id?: string;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const catalog = this.getWorkflowCatalog(loadedConfig);
    const workflow = getWorkflowByName(catalog.workflows, args.name).workflow;
    const { run, resumed } = startOrResumeWorkflowRun(loadedConfig, workflow, args.args ?? {}, {
      resume: args.resume,
      runId: args.run_id,
    });
    return {
      run_id: run.status.run_id,
      status_url: run.runDir,
      workflow_name: run.status.workflow_name,
      resumed,
    };
  }

  async workflowFindRun(args: {
    ticket_slug: string;
    workflow_name?: string;
    include_completed?: boolean;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const workflowName = args.workflow_name;
    if (!workflowName) {
      throw new Error("workflow_name is required for workflow_find_run.");
    }

    const indexed = findIndexedRun(loadedConfig, workflowName, args.ticket_slug, {
      includeCompleted: args.include_completed ?? false,
    });

    if (!indexed) {
      return { run: null };
    }

    return {
      run: {
        run_id: indexed.run.status.run_id,
        workflow_name: indexed.run.status.workflow_name,
        completed_at: indexed.run.status.completed_at,
        completed_phases: indexed.run.status.completed_phases,
        pending_phases: indexed.run.status.pending_phases,
        approval_gates_pending: indexed.run.status.approval_gates_pending,
      },
    };
  }

  async workflowResume(args: {
    ticket_slug: string;
    workflow_name: string;
    project_path?: string;
  }) {
    return this.workflowStart({
      name: args.workflow_name,
      resume: true,
      args: { ticket_slug: args.ticket_slug },
      project_path: args.project_path,
    });
  }

  async workflowStatus(args: { run_id: string; project_path?: string }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    syncApprovalGates(run.status, run.workflow);
    saveWorkflowRun(loadedConfig, run);
    return {
      run_id: run.status.run_id,
      name: run.status.workflow_name,
      current_layer: run.status.current_layer,
      completed_phases: run.status.completed_phases,
      pending_gates: run.status.approval_gates_pending,
      validation_failures: run.status.validation_failures,
      pending_phases: run.status.pending_phases,
      running_phases: run.status.running_phases,
      completed_at: run.status.completed_at,
    };
  }

  async workflowDispatchPhase(args: {
    run_id: string;
    phase_id?: string;
    force?: boolean;
    approval_response?: "approve" | "request_changes" | "abort";
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    syncApprovalGates(run.status, run.workflow);

    const pendingGate = getTriggeredApprovalGate(run.status, run.workflow);
    if (pendingGate) {
      if (args.approval_response === "approve") {
        markGateApproved(run.status, pendingGate.after);
      } else {
        saveWorkflowRun(loadedConfig, run);
        return {
          blocked: true,
          gate: pendingGate,
          message: pendingGate.prompt,
        };
      }
    }

    let phases = args.phase_id
      ? [getWorkflowPhase(run.workflow, args.phase_id)]
      : getEligiblePhases(run.workflow, run.status);

    if (phases.length === 0) {
      if (run.status.pending_phases.length === 0) {
        run.status.completed_at ??= new Date().toISOString();
        saveWorkflowRun(loadedConfig, run);
        return { done: true, reason: "All workflow phases are complete." };
      }

      saveWorkflowRun(loadedConfig, run);
      return {
        blocked: true,
        gate: "waiting",
        message:
          run.status.running_phases.length > 0
            ? `Waiting for running phases: ${run.status.running_phases.join(", ")}`
            : "No eligible phases are ready to dispatch.",
      };
    }

    if (args.force && phases.length > 1) {
      phases = [phases[0]];
    }

    const layers = buildWorkflowLayers(run.workflow);
    const dispatchMode = phases.length > 1 ? "parallel" : "sequential";
    const envelopes: WorkflowDispatchEnvelope[] = phases.map((phase) => {
      const phaseIndex = run.workflow.phases.findIndex((entry) => entry.id === phase.id);
      const artifactPath = artifactPathForPhase(run.runDir, phase.id);
      return generateWorkflowEnvelope({
        runId: run.status.run_id,
        workflow: run.workflow,
        phase,
        phaseIndex,
        artifactPath,
        harness: this.getHarness(),
        config: loadedConfig.config,
      });
    });

    run.status.current_layer = layers.findIndex((layer) => layer.includes(phases[0].id));
    for (const phase of phases) {
      if (!run.status.running_phases.includes(phase.id)) {
        run.status.running_phases.push(phase.id);
      }
    }
    saveWorkflowRun(loadedConfig, run);

    return {
      envelopes,
      dispatch_mode: dispatchMode,
    };
  }

  async workflowValidateDispatch(args: {
    run_id: string;
    phase_id: string;
    envelope: Partial<WorkflowDispatchEnvelope>;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    const phase = getWorkflowPhase(run.workflow, args.phase_id);
    const phaseIndex = run.workflow.phases.findIndex((entry) => entry.id === phase.id);
    const expected = generateWorkflowEnvelope({
      runId: run.status.run_id,
      workflow: run.workflow,
      phase,
      phaseIndex,
      artifactPath: artifactPathForPhase(run.runDir, phase.id),
      harness: this.getHarness(),
      config: loadedConfig.config,
    });
    const errors = validateEnvelopeAgainstPhase(expected, args.envelope);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async workflowValidateOutput(args: {
    run_id: string;
    phase_id: string;
    output_envelope: Record<string, unknown>;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    const phase = getWorkflowPhase(run.workflow, args.phase_id);
    const outputs =
      typeof args.output_envelope.outputs === "object" && args.output_envelope.outputs !== null
        ? (args.output_envelope.outputs as Record<string, unknown>)
        : args.output_envelope;

    const missingOutputs = phase.contract.outputs
      .filter((field) => field.required)
      .map((field) => field.name)
      .filter((name) => !(name in outputs));

    const logEntries = readDispatchLogEntries(run.runDir, args.phase_id);
    const missingToolCalls: string[] = [];
    if (
      phase.contract.requires_memory_query &&
      !logEntries.some((entry) => entry.tool === "memory_retrieve" && entry.ok)
    ) {
      missingToolCalls.push("memory_retrieve");
    }
    if (
      phase.contract.requires_knowledge_query &&
      !logEntries.some(
        (entry) =>
          (entry.tool === "knowledge_search" || entry.tool === "knowledge_query") && entry.ok
      )
    ) {
      missingToolCalls.push("knowledge_search|knowledge_query");
    }

    const errors = [
      ...missingOutputs.map((name) => `Missing required output "${name}".`),
      ...missingToolCalls.map((tool) => `Missing required tool call "${tool}".`),
    ];
    updateValidationFailure(run.status, args.phase_id, errors);
    saveWorkflowRun(loadedConfig, run);

    return {
      valid: errors.length === 0,
      errors,
      missing_outputs: missingOutputs,
      missing_tool_calls: missingToolCalls,
    };
  }

  async workflowRecordArtifact(args: {
    run_id: string;
    phase_id: string;
    artifact: string | ArtifactPayload;
    status?: "complete" | "failed" | "partial";
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    const artifactStatus = args.status ?? "complete";
    const payload =
      typeof args.artifact === "string"
        ? ({
            content: args.artifact,
            outputs: {},
            format: "md",
          } satisfies ArtifactPayload)
        : args.artifact;

    const format = payload.format ?? (payload.content ? "md" : "json");
    const path = artifactPathForPhase(run.runDir, args.phase_id, format);
    mkdirSync(resolve(path, ".."), { recursive: true });

    if (format === "json") {
      writeFileSync(
        path,
        `${JSON.stringify(
          {
            content: payload.content ?? null,
            outputs: payload.outputs ?? {},
            metadata: payload.metadata ?? {},
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    } else {
      writeFileSync(path, payload.content ?? "", "utf8");
    }

    recordPhaseArtifact(run.workflow, run.status, {
      phaseId: args.phase_id,
      path,
      artifactStatus,
      outputs: payload.outputs ?? {},
    });
    saveWorkflowRun(loadedConfig, run);

    return {
      written_path: path,
    };
  }

  async workflowPhaseBundle(args: {
    run_id: string;
    phase_id: string;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    const phase = getWorkflowPhase(run.workflow, args.phase_id);
    const resolvedInputs = resolveInputValues(run.workflow, run.status, args.phase_id);
    const defaults = resolvePhaseDefaults(run.workflow, phase);

    const upstreamArtifacts = Object.values(run.status.artifacts).filter((artifact) =>
      (phase.depends_on ?? []).includes(artifact.phase_id)
    );

    return {
      context: {
        run_id: run.status.run_id,
        workflow_name: run.status.workflow_name,
        upstream_artifacts: upstreamArtifacts,
        validation_failures: run.status.validation_failures.filter(
          (failure) => failure.phase_id === args.phase_id
        ),
      },
      inputs_resolved: resolvedInputs,
      defaults_resolved: defaults,
    };
  }

  async workflowLessons(args: {
    run_id: string;
    phase_id: string;
    project_path?: string;
  }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);
    const phase = getWorkflowPhase(run.workflow, args.phase_id);
    const resolvedInputs = resolveInputValues(run.workflow, run.status, args.phase_id);

    return {
      lessons: [],
      required_memory_query: phase.contract.requires_memory_query,
      required_knowledge_query: phase.contract.requires_knowledge_query,
      suggested_memory_query: [args.phase_id, ...Object.keys(resolvedInputs.values)].join(" ").trim(),
      suggested_knowledge_query: `${run.status.workflow_name} ${args.phase_id}`.trim(),
    };
  }

  async workflowComplete(args: { run_id: string; project_path?: string }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const run = loadWorkflowRun(loadedConfig, args.run_id);

    if (run.status.pending_phases.length > 0) {
      throw new Error(
        `Workflow "${args.run_id}" is not complete. Pending phases: ${run.status.pending_phases.join(", ")}`
      );
    }

    run.status.completed_at ??= new Date().toISOString();
    const artifactIndex = Object.values(run.status.artifacts) as WorkflowArtifactRecord[];
    writeFileSync(resolve(run.runDir, "_artifacts.json"), `${JSON.stringify(artifactIndex, null, 2)}\n`, "utf8");
    saveWorkflowRun(loadedConfig, run);

    return {
      completed_at: run.status.completed_at,
      promotion_candidates: run.status.promotion_candidates,
    };
  }

  async workflowRuntimeInfo(args: { project_path?: string } = {}) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const harness = this.getHarness();
    const embeddingsEnv = loadedConfig.config.embeddings.api_key_env;
    const llmEnv = llmApiKeyEnv(loadedConfig.config);
    return {
      harness,
      models_available:
        harness === "unknown" ? {} : loadedConfig.config.model_tiers?.[harness] ?? {},
      embeddings_ok: Boolean(this.env[embeddingsEnv]),
      llm_ok: llmEnv ? Boolean(this.env[llmEnv]) : false,
    };
  }

  async workflowValidateYaml(args: { path: string; project_path?: string }) {
    const loadedConfig = this.getLoadedConfig(args.project_path);
    const targetPath = resolve(loadedConfig.projectRoot, args.path);
    const result = validateWorkflowYamlFile(targetPath, "1.0.0");
    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    };
  }
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

async function runLoggedTool<T>(
  service: WorkflowService,
  tool: string,
  payload: Record<string, unknown>,
  handler: () => Promise<T>
) {
  const projectPath =
    typeof payload.project_path === "string" ? payload.project_path : undefined;
  const loadedConfig = loadSaguaroConfig(projectPath ?? service["projectRoot"]);
  const startedAt = Date.now();

  try {
    const result = await handler();
    const runId =
      typeof payload.run_id === "string"
        ? payload.run_id
        : typeof (result as Record<string, unknown>)?.run_id === "string"
        ? ((result as Record<string, unknown>).run_id as string)
        : undefined;
    const phaseId =
      typeof payload.phase_id === "string" ? payload.phase_id : null;
    service["logToolIfRunScoped"]({
      loadedConfig,
      runId,
      phaseId,
      tool,
      payload,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    return textResult(result);
  } catch (error) {
    const runId = typeof payload.run_id === "string" ? payload.run_id : undefined;
    const phaseId = typeof payload.phase_id === "string" ? payload.phase_id : null;
    service["logToolIfRunScoped"]({
      loadedConfig,
      runId,
      phaseId,
      tool,
      payload,
      durationMs: Date.now() - startedAt,
      ok: false,
    });
    throw error;
  }
}

export function createServer(options: WorkflowServiceOptions = {}): McpServer {
  const service = new WorkflowService(options);
  const server = new McpServer({
    name: "saguaro-workflow",
    version: "0.1.0-alpha.2",
  });

  server.tool(
    "workflow_list",
    "List available Saguaro workflows from project and bundled directories. Project workflows shadow bundled workflows by name.",
    {
      project_path: z.string().optional(),
    },
    async (args) => runLoggedTool(service, "workflow_list", args, () => service.workflowList(args))
  );

  server.tool(
    "workflow_start",
    "Start or resume a workflow run. With ticket_slug and resume auto (default), returns an existing incomplete run instead of resetting state.",
    {
      name: z.string(),
      args: z.record(z.string(), z.unknown()).optional(),
      resume: z.union([z.enum(["auto"]), z.boolean()]).optional(),
      run_id: z.string().optional(),
      project_path: z.string().optional(),
    },
    async (args) => runLoggedTool(service, "workflow_start", args, () => service.workflowStart(args))
  );

  server.tool(
    "workflow_find_run",
    "Find a workflow run indexed by ticket_slug and workflow_name. Returns null when no matching run exists.",
    {
      ticket_slug: z.string(),
      workflow_name: z.string(),
      include_completed: z.boolean().optional(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_find_run", args, () => service.workflowFindRun(args))
  );

  server.tool(
    "workflow_resume",
    "Resume an incomplete workflow run for a ticket_slug and workflow_name. Errors when no incomplete run exists.",
    {
      ticket_slug: z.string(),
      workflow_name: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_resume", args, () => service.workflowResume(args))
  );

  server.tool(
    "workflow_status",
    "Read workflow run status from _status.json and _queue.md state.",
    {
      run_id: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_status", args, () => service.workflowStatus(args))
  );

  server.tool(
    "workflow_dispatch_phase",
    "Return dispatch envelopes for the next eligible phase or parallel layer. May return done or blocked.",
    {
      run_id: z.string(),
      phase_id: z.string().optional(),
      force: z.boolean().optional(),
      approval_response: z.enum(["approve", "request_changes", "abort"]).optional(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_dispatch_phase", args, () =>
        service.workflowDispatchPhase(args)
      )
  );

  server.tool(
    "workflow_validate_dispatch",
    "Validate that a dispatch envelope still matches the workflow phase contract.",
    {
      run_id: z.string(),
      phase_id: z.string(),
      envelope: z.object({}).passthrough(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_validate_dispatch", args, () =>
        service.workflowValidateDispatch(args)
      )
  );

  server.tool(
    "workflow_validate_output",
    "Validate required outputs and required memory or knowledge calls for a phase using _dispatch.jsonl.",
    {
      run_id: z.string(),
      phase_id: z.string(),
      output_envelope: z.object({}).passthrough(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_validate_output", args, () =>
        service.workflowValidateOutput(args)
      )
  );

  server.tool(
    "workflow_record_artifact",
    "Persist a phase artifact and advance run state.",
    {
      run_id: z.string(),
      phase_id: z.string(),
      artifact: z.union([
        z.string(),
        z
          .object({
            content: z.string().optional(),
            outputs: z.record(z.string(), z.unknown()).optional(),
            format: z.enum(["md", "json", "txt"]).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      ]),
      status: z.enum(["complete", "failed", "partial"]).optional(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_record_artifact", args, () =>
        service.workflowRecordArtifact(args)
      )
  );

  server.tool(
    "workflow_phase_bundle",
    "Resolve phase context, upstream inputs, and default runtime settings in one call.",
    {
      run_id: z.string(),
      phase_id: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_phase_bundle", args, () =>
        service.workflowPhaseBundle(args)
      )
  );

  server.tool(
    "workflow_lessons",
    "Return workflow-level lesson lookup hints for the current phase.",
    {
      run_id: z.string(),
      phase_id: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_lessons", args, () => service.workflowLessons(args))
  );

  server.tool(
    "workflow_complete",
    "Mark a workflow run complete and write _artifacts.json when all phases are done.",
    {
      run_id: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_complete", args, () => service.workflowComplete(args))
  );

  server.tool(
    "workflow_runtime_info",
    "Describe the detected harness and project-local model configuration for this workflow server.",
    {
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_runtime_info", args, () => service.workflowRuntimeInfo(args))
  );

  server.tool(
    "workflow_validate_yaml",
    "Validate a workflow YAML file against the v1 schema and semantic workflow rules.",
    {
      path: z.string(),
      project_path: z.string().optional(),
    },
    async (args) =>
      runLoggedTool(service, "workflow_validate_yaml", args, () => service.workflowValidateYaml(args))
  );

  return server;
}
