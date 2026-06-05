import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { LoadedSaguaroConfig } from "../config.js";
import { renderRunQueueMarkdown } from "./queue.js";
import {
  findIncompleteRun,
  registerTicketRunIndex,
  syncTicketIndexFromRun,
} from "./run-index.js";
import {
  buildWorkflowLayers,
  getWorkflowPhase,
  getUpstreamPhaseIds,
  type WorkflowDefinition,
  type WorkflowPhase,
  type WorkflowSourceEntry,
} from "./types.js";

export interface WorkflowGateStatus {
  after: string;
  prompt: string;
}

export interface WorkflowValidationFailure {
  phase_id: string;
  errors: string[];
  recorded_at: string;
}

export interface WorkflowArtifactRecord {
  phase_id: string;
  path: string;
  status: "complete" | "failed" | "partial";
  recorded_at: string;
  outputs: string[];
}

export interface WorkflowSourceMetadata {
  source: WorkflowSourceEntry["source"];
  path: string;
}

export interface WorkflowRunStatus {
  run_id: string;
  workflow_name: string;
  workflow_version: string;
  workflow_source?: WorkflowSourceMetadata;
  project_root: string;
  started_at: string;
  completed_at: string | null;
  current_layer: number;
  completed_phases: string[];
  pending_phases: string[];
  running_phases: string[];
  approval_gates_pending: WorkflowGateStatus[];
  approved_gates: string[];
  validation_failures: WorkflowValidationFailure[];
  promotion_candidates: string[];
  workflow_args: Record<string, unknown>;
  phase_outputs: Record<string, Record<string, unknown>>;
  artifacts: Record<string, WorkflowArtifactRecord>;
}

export interface LoadedWorkflowRun {
  runDir: string;
  statusPath: string;
  queuePath: string;
  workflowPath: string;
  status: WorkflowRunStatus;
  workflow: WorkflowDefinition;
}

export type WorkflowResumeMode = "auto" | boolean;

export function createOpaqueRunId(workflowName: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${workflowName}-${stamp}-${randomUUID().slice(0, 6)}`;
}

export function createRunId(
  workflowName: string,
  _workflowArgs: Record<string, unknown> = {}
): string {
  return createOpaqueRunId(workflowName);
}

export function getRunDir(config: LoadedSaguaroConfig, runId: string): string {
  return resolve(config.projectRoot, config.config.runs_dir, runId);
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeRunFiles(
  loadedConfig: LoadedSaguaroConfig,
  workflow: WorkflowDefinition,
  status: WorkflowRunStatus
): LoadedWorkflowRun {
  const runDir = getRunDir(loadedConfig, status.run_id);
  const statusPath = resolve(runDir, "_status.json");
  const queuePath = resolve(runDir, "_queue.md");
  const workflowPath = resolve(runDir, "_workflow.json");
  const dispatchPath = resolve(runDir, "_dispatch.jsonl");

  mkdirSync(runDir, { recursive: true });
  writeJson(statusPath, status);
  writeFileSync(queuePath, renderRunQueueMarkdown(status, workflow), "utf8");
  writeJson(workflowPath, workflow);
  if (!existsSync(dispatchPath)) {
    writeFileSync(dispatchPath, "", "utf8");
  }

  return { runDir, statusPath, queuePath, workflowPath, status, workflow };
}

export function createWorkflowRun(
  loadedConfig: LoadedSaguaroConfig,
  workflow: WorkflowDefinition,
  workflowArgs: Record<string, unknown> = {},
  runId = createRunId(workflow.name, workflowArgs),
  workflowSource?: WorkflowSourceMetadata
): LoadedWorkflowRun {
  const status: WorkflowRunStatus = {
    run_id: runId,
    workflow_name: workflow.name,
    workflow_version: workflow.version ?? "1.0.0",
    ...(workflowSource ? { workflow_source: workflowSource } : {}),
    project_root: loadedConfig.projectRoot,
    started_at: new Date().toISOString(),
    completed_at: null,
    current_layer: 0,
    completed_phases: [],
    pending_phases: workflow.phases.map((phase) => phase.id),
    running_phases: [],
    approval_gates_pending: [],
    approved_gates: [],
    validation_failures: [],
    promotion_candidates: [],
    workflow_args: workflowArgs,
    phase_outputs: {},
    artifacts: {},
  };

  return writeRunFiles(loadedConfig, workflow, status);
}

export function startOrResumeWorkflowRun(
  loadedConfig: LoadedSaguaroConfig,
  workflow: WorkflowDefinition,
  workflowArgs: Record<string, unknown> = {},
  options: { resume?: WorkflowResumeMode; runId?: string; workflowSource?: WorkflowSourceMetadata } = {}
): { run: LoadedWorkflowRun; resumed: boolean } {
  const resume = options.resume ?? "auto";
  const explicitRunId =
    options.runId ??
    (typeof workflowArgs.run_id === "string" && workflowArgs.run_id.trim().length > 0
      ? workflowArgs.run_id.trim()
      : undefined);

  if (explicitRunId) {
    try {
      const existing = loadWorkflowRun(loadedConfig, explicitRunId);
      if (existing.status.workflow_name !== workflow.name) {
        throw new Error(
          `Run "${explicitRunId}" is for workflow "${existing.status.workflow_name}", not "${workflow.name}".`
        );
      }
      return { run: existing, resumed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("does not exist")) {
        throw error;
      }
    }

    const run = createWorkflowRun(
      loadedConfig,
      workflow,
      workflowArgs,
      explicitRunId,
      options.workflowSource
    );
    registerTicketRunIndex(loadedConfig, run);
    return { run, resumed: false };
  }

  const ticketSlug = workflowArgs.ticket_slug ?? workflowArgs.ticket;
  const normalizedTicketSlug =
    typeof ticketSlug === "string" && ticketSlug.trim().length > 0 ? ticketSlug.trim() : null;

  if (normalizedTicketSlug && resume !== false) {
    const incomplete = findIncompleteRun(loadedConfig, workflow.name, normalizedTicketSlug);
    if (incomplete) {
      return { run: incomplete, resumed: true };
    }

    if (resume === true) {
      throw new Error(
        `No incomplete run for ticket "${normalizedTicketSlug}" and workflow "${workflow.name}".`
      );
    }
  }

  const run = createWorkflowRun(
    loadedConfig,
    workflow,
    workflowArgs,
    undefined,
    options.workflowSource
  );
  registerTicketRunIndex(loadedConfig, run);
  return { run, resumed: false };
}

export function loadWorkflowRun(
  loadedConfig: LoadedSaguaroConfig,
  runId: string
): LoadedWorkflowRun {
  const runDir = getRunDir(loadedConfig, runId);
  const statusPath = resolve(runDir, "_status.json");
  const queuePath = resolve(runDir, "_queue.md");
  const workflowPath = resolve(runDir, "_workflow.json");

  if (!existsSync(statusPath) || !existsSync(workflowPath)) {
    throw new Error(`Run "${runId}" does not exist under ${runDir}.`);
  }

  const status = JSON.parse(readFileSync(statusPath, "utf8")) as WorkflowRunStatus;
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as WorkflowDefinition;
  return { runDir, statusPath, queuePath, workflowPath, status, workflow };
}

export function saveWorkflowRun(
  loadedConfig: LoadedSaguaroConfig,
  run: LoadedWorkflowRun
): LoadedWorkflowRun {
  const saved = writeRunFiles(loadedConfig, run.workflow, run.status);
  syncTicketIndexFromRun(loadedConfig, saved);
  return saved;
}

export function artifactPathForPhase(runDir: string, phaseId: string, extension = "md"): string {
  return resolve(runDir, `${phaseId}.${extension}`);
}

export function updateValidationFailure(
  status: WorkflowRunStatus,
  phaseId: string,
  errors: string[]
): WorkflowRunStatus {
  const remaining = status.validation_failures.filter((failure) => failure.phase_id !== phaseId);
  if (errors.length > 0) {
    remaining.push({
      phase_id: phaseId,
      errors,
      recorded_at: new Date().toISOString(),
    });
    status.running_phases = status.running_phases.filter((id) => id !== phaseId);
  }
  status.validation_failures = remaining;
  return status;
}

export function getTriggeredApprovalGate(
  status: WorkflowRunStatus,
  workflow: WorkflowDefinition
): WorkflowGateStatus | null {
  const pending = status.approval_gates_pending[0];
  if (pending) {
    return pending;
  }

  for (const gate of workflow.approval_gates ?? []) {
    if (status.approved_gates.includes(gate.after)) {
      continue;
    }
    if (status.completed_phases.includes(gate.after)) {
      return { after: gate.after, prompt: gate.prompt };
    }
  }

  return null;
}

export function syncApprovalGates(
  status: WorkflowRunStatus,
  workflow: WorkflowDefinition
): WorkflowRunStatus {
  const triggered = getTriggeredApprovalGate(status, workflow);
  status.approval_gates_pending = triggered ? [triggered] : [];
  return status;
}

export function markGateApproved(
  status: WorkflowRunStatus,
  afterPhase: string
): WorkflowRunStatus {
  if (!status.approved_gates.includes(afterPhase)) {
    status.approved_gates.push(afterPhase);
  }
  status.approval_gates_pending = status.approval_gates_pending.filter(
    (gate) => gate.after !== afterPhase
  );
  return status;
}

export function getNextLayerIndex(
  workflow: WorkflowDefinition,
  status: WorkflowRunStatus
): number {
  const layers = buildWorkflowLayers(workflow);
  const incomplete = new Set(status.pending_phases);
  for (let index = 0; index < layers.length; index += 1) {
    if (layers[index].some((phaseId) => incomplete.has(phaseId))) {
      return index;
    }
  }
  return layers.length;
}

export function getEligiblePhases(
  workflow: WorkflowDefinition,
  status: WorkflowRunStatus
): WorkflowPhase[] {
  const layers = buildWorkflowLayers(workflow);
  const completed = new Set(status.completed_phases);
  const running = new Set(status.running_phases);
  const pending = new Set(status.pending_phases);

  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const eligible = layer
      .filter((phaseId) => pending.has(phaseId) && !running.has(phaseId))
      .filter((phaseId) =>
        getUpstreamPhaseIds(workflow, phaseId).every((dependency) => completed.has(dependency))
      )
      .map((phaseId) => getWorkflowPhase(workflow, phaseId));

    if (eligible.length > 0) {
      status.current_layer = index;
      return eligible;
    }
  }

  status.current_layer = layers.length;
  return [];
}

export function resolveInputValues(
  workflow: WorkflowDefinition,
  status: WorkflowRunStatus,
  phaseId: string
): {
  values: Record<string, unknown>;
  missing_required: string[];
} {
  const phase = getWorkflowPhase(workflow, phaseId);
  const values: Record<string, unknown> = {};
  const missingRequired: string[] = [];

  const directDependencies = getUpstreamPhaseIds(workflow, phaseId).map(
    (dependency) => status.phase_outputs[dependency] ?? {}
  );
  const allOutputs = Object.values(status.phase_outputs);

  for (const input of phase.contract.inputs) {
    if (input.name in status.workflow_args) {
      values[input.name] = status.workflow_args[input.name];
      continue;
    }

    const source = [...directDependencies, ...allOutputs].find(
      (candidate) => input.name in candidate
    );

    if (source) {
      values[input.name] = source[input.name];
    } else if (input.required) {
      missingRequired.push(input.name);
    }
  }

  return { values, missing_required: missingRequired };
}

export function markPhaseRunning(
  status: WorkflowRunStatus,
  phaseIds: string[]
): WorkflowRunStatus {
  for (const phaseId of phaseIds) {
    if (!status.running_phases.includes(phaseId)) {
      status.running_phases.push(phaseId);
    }
  }
  return status;
}

export function recordPhaseArtifact(
  workflow: WorkflowDefinition,
  status: WorkflowRunStatus,
  args: {
    phaseId: string;
    path: string;
    artifactStatus: "complete" | "failed" | "partial";
    outputs: Record<string, unknown>;
  }
): WorkflowRunStatus {
  status.running_phases = status.running_phases.filter((phaseId) => phaseId !== args.phaseId);

  if (args.artifactStatus === "complete" && !status.completed_phases.includes(args.phaseId)) {
    status.completed_phases.push(args.phaseId);
  }

  if (args.artifactStatus === "complete") {
    status.pending_phases = status.pending_phases.filter((phaseId) => phaseId !== args.phaseId);
  }

  status.phase_outputs[args.phaseId] = args.outputs;
  status.artifacts[args.phaseId] = {
    phase_id: args.phaseId,
    path: args.path,
    status: args.artifactStatus,
    recorded_at: new Date().toISOString(),
    outputs: Object.keys(args.outputs),
  };

  status.current_layer = getNextLayerIndex(workflow, status);
  return syncApprovalGates(status, workflow);
}
