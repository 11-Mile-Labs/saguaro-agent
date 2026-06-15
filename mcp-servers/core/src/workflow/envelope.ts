import type { HarnessName, ModelTier, SaguaroConfig } from "../config.js";
import type { WorkflowSourceMetadata } from "./runtime.js";
import { resolvePhaseDefaults, type WorkflowDefinition, type WorkflowPhase } from "./types.js";

export interface WorkflowDispatchEnvelope {
  envelope_version: 1;
  run_id: string;
  workflow_name: string;
  workflow_source?: WorkflowSourceMetadata;
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

const GENERIC_ARCHITECTURE_CHECKS = "consistency with stated invariants and module boundaries.";
const GENERIC_REUSE_CHECKS = "search the codebase for existing equivalents before adding new code.";

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

function isDocsWriterPhase(phase: WorkflowPhase): boolean {
  return phase.agent.toLowerCase() === "docs-writer";
}

function isDevilsAdvocatePhase(phase: WorkflowPhase): boolean {
  return phase.agent.toLowerCase() === "devils-advocate";
}

function formatHostCheck(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);

    if (entries.length > 0) {
      return entries.map((entry) => `- ${entry}`).join(" ");
    }
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function daRubricInstructions(inputs: Record<string, unknown>): string {
  const architectureChecks = formatHostCheck(
    inputs.architecture_checks,
    GENERIC_ARCHITECTURE_CHECKS
  );
  const reuseChecks = formatHostCheck(inputs.reuse_checks, GENERIC_REUSE_CHECKS);

  return [
    "Devil's Advocate rubric: explicitly address all 7 Engineering Questions; if a question does not apply, say why.",
    "1. Is this the simplest solution? Could 80% of the value be achieved with 30% of the complexity?",
    "2. Are we building for a real need or a hypothetical one?",
    "3. What's the blast radius if this breaks?",
    `4. Does this respect the project architecture? Host-supplied checks: ${architectureChecks}`,
    "5. What's the rollback plan?",
    `6. Have we checked what already exists? Host-supplied checks: ${reuseChecks}`,
    "7. What maintenance burden does this create?",
    "Severity scale: Critical blocks implementation; Moderate must be addressed before or during implementation; Minor is advisory.",
    "Critical means production breakage, data loss, security vulnerability, or core architecture violation.",
    "Escalation states: BLOCKED means missing info or operator-only decision; CRITICAL_RISK maps to the existing block gate and requires explicit approval before implementation; CONTEXT_DRIFT means the solution no longer matches the intake/root cause and must be surfaced for confirmation.",
    "Finding zero challenges is itself a red flag; document why each question does not apply. Challenge with evidence or reasoning. Do not redesign the solution.",
    "Only Critical severity blocks; Moderate and Minor findings are advisory.",
  ].join(" ");
}

function dispatchContractForPhase(
  phase: WorkflowPhase,
  artifactPath: string,
  phaseInputs: Record<string, unknown> = {}
): string {
  const instructions: string[] = [
    `Run phase "${phase.id}" and write the final artifact to ${artifactPath}.`,
  ];

  if (isDocsWriterPhase(phase)) {
    instructions.push(
      "Docs-writer phases must write complete multi-section markdown prose, not a pointer, summary, or path."
    );
    instructions.push(
      "When recording the artifact, pass the full markdown document in artifact.content."
    );
  }

  if (isDevilsAdvocatePhase(phase)) {
    instructions.push(daRubricInstructions(phaseInputs));
  }

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
  workflowSource?: WorkflowSourceMetadata;
  harness: HarnessName;
  config: SaguaroConfig;
  phaseInputs?: Record<string, unknown>;
}): WorkflowDispatchEnvelope {
  const defaults = resolvePhaseDefaults(args.workflow, args.phase);

  return {
    envelope_version: 1,
    run_id: args.runId,
    workflow_name: args.workflow.name,
    ...(args.workflowSource ? { workflow_source: args.workflowSource } : {}),
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
    dispatch_contract: dispatchContractForPhase(args.phase, args.artifactPath, args.phaseInputs),
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
