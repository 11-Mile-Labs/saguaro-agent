import type { HarnessName, ModelTier, SaguaroConfig } from "../config.js";
import { resolvePhaseDefaults, type WorkflowDefinition, type WorkflowPhase } from "./types.js";

export interface WorkflowDispatchEnvelope {
  envelope_version: 1;
  run_id: string;
  workflow_name: string;
  phase_id: string;
  phase_index: number;
  agent: string;
  resolved_agent: string;
  model_tier: ModelTier;
  resolved_model: string | null;
  effort: "low" | "medium" | "high";
  inputs_required: string[];
  outputs_required: string[];
  tools_required: string[];
  tools_optional: string[];
  artifact_path: string;
  parallel_group_id: string | null;
  depends_on: string[];
  dispatch_contract: string;
}

export function resolveModelForHarness(
  config: SaguaroConfig,
  harness: HarnessName,
  tier: ModelTier
): string | null {
  if (harness === "unknown") {
    return null;
  }

  return config.model_tiers?.[harness]?.[tier] ?? null;
}

export function resolveAgentForHarness(agent: string, harness: HarnessName): string {
  const normalized = agent.toLowerCase();
  if (normalized === "explore" || normalized === "explorer") {
    if (harness === "claude") {
      return "Explore";
    }
    if (harness === "codex") {
      return "explorer";
    }
  }
  return agent;
}

function requiredToolsForPhase(phase: WorkflowPhase): string[] {
  const required = ["workflow_record_artifact"];
  if (phase.contract.requires_memory_query) {
    required.unshift("memory_retrieve");
  }
  if (phase.contract.requires_knowledge_query) {
    required.unshift("knowledge_search");
  }
  return required;
}

function dispatchContractForPhase(
  phase: WorkflowPhase,
  artifactPath: string
): string {
  const instructions: string[] = [
    `Run phase "${phase.id}" and write the final artifact to ${artifactPath}.`,
  ];

  if (phase.contract.requires_memory_query) {
    instructions.push("Call memory_retrieve before producing output.");
  }
  if (phase.contract.requires_knowledge_query) {
    instructions.push("Call knowledge_search or knowledge_query before producing output.");
  }

  instructions.push(
    `When finished, call workflow_record_artifact with phase_id "${phase.id}" and the outputs you produced.`
  );
  return instructions.join(" ");
}

export function generateWorkflowEnvelope(args: {
  runId: string;
  workflow: WorkflowDefinition;
  phase: WorkflowPhase;
  phaseIndex: number;
  artifactPath: string;
  harness: HarnessName;
  config: SaguaroConfig;
}): WorkflowDispatchEnvelope {
  const defaults = resolvePhaseDefaults(args.workflow, args.phase);

  return {
    envelope_version: 1,
    run_id: args.runId,
    workflow_name: args.workflow.name,
    phase_id: args.phase.id,
    phase_index: args.phaseIndex,
    agent: args.phase.agent,
    resolved_agent: resolveAgentForHarness(args.phase.agent, args.harness),
    model_tier: defaults.model_tier,
    resolved_model: resolveModelForHarness(args.config, args.harness, defaults.model_tier),
    effort: defaults.effort,
    inputs_required: args.phase.contract.inputs.filter((item) => item.required).map((item) => item.name),
    outputs_required: args.phase.contract.outputs.filter((item) => item.required).map((item) => item.name),
    tools_required: requiredToolsForPhase(args.phase),
    tools_optional: ["workflow_phase_bundle", "workflow_lessons", "knowledge_query"],
    artifact_path: args.artifactPath,
    parallel_group_id: args.phase.parallel_group ?? null,
    depends_on: [...(args.phase.depends_on ?? [])],
    dispatch_contract: dispatchContractForPhase(args.phase, args.artifactPath),
  };
}

export function validateEnvelopeAgainstPhase(
  expected: WorkflowDispatchEnvelope,
  observed: Partial<WorkflowDispatchEnvelope>
): string[] {
  const errors: string[] = [];

  if (observed.run_id && observed.run_id !== expected.run_id) {
    errors.push(`Envelope run_id mismatch: expected "${expected.run_id}", received "${observed.run_id}".`);
  }
  if (observed.phase_id && observed.phase_id !== expected.phase_id) {
    errors.push(`Envelope phase_id mismatch: expected "${expected.phase_id}", received "${observed.phase_id}".`);
  }
  if (observed.agent && observed.agent !== expected.agent) {
    errors.push(`Envelope agent mismatch: expected "${expected.agent}", received "${observed.agent}".`);
  }

  const observedRequired = new Set(observed.tools_required ?? []);
  for (const tool of expected.tools_required) {
    if (!observedRequired.has(tool)) {
      errors.push(`Envelope missing required tool "${tool}".`);
    }
  }

  if (observed.artifact_path && observed.artifact_path !== expected.artifact_path) {
    errors.push(
      `Envelope artifact_path mismatch: expected "${expected.artifact_path}", received "${observed.artifact_path}".`
    );
  }

  return errors;
}
