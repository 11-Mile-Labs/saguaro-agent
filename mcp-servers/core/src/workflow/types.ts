import { z } from "zod";
import { EffortSchema, ModelTierSchema, ScopeSchema } from "../config.js";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const KNOWN_AGENTS = new Set([
  "general-purpose",
  "explore",
  "explorer",
  "planner",
  "architect",
  "code-reviewer",
  "impact-analyzer",
  "devils-advocate",
  "implementer",
  "docs-writer",
]);

const IoRequirementSchema = z.enum(["required", "optional"]);

export interface ContractField {
  name: string;
  required: boolean;
}

const ContractFieldSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return { name: value, required: true };
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 1) {
        const [name, requirement] = entries[0];
        return {
          name,
          required: requirement !== "optional",
        };
      }
    }

    return value;
  },
  z
    .object({
      name: z.string().min(1),
      required: z.boolean().default(true),
    })
    .strict()
);

export const WorkflowContractSchema = z
  .object({
    inputs: z.array(ContractFieldSchema).default([]),
    outputs: z.array(ContractFieldSchema).default([]),
    requires_memory_query: z.boolean().default(false).optional(),
    requires_knowledge_query: z.boolean().default(false).optional(),
  })
  .strict();

export const WorkflowDefaultsSchema = z
  .object({
    model_tier: ModelTierSchema.default("standard").optional(),
    effort: EffortSchema.default("medium").optional(),
    memory_scope: z.array(ScopeSchema).default(["run", "project"]).optional(),
    knowledge_scope: z.array(ScopeSchema).default(["project"]).optional(),
  })
  .strict()
  .default({});

export const ApprovalGateSchema = z
  .object({
    after: z.string().min(1),
    prompt: z.string().min(1),
  })
  .strict();

export const WorkflowPhaseSchema = z
  .object({
    id: z.string().min(1),
    depends_on: z.array(z.string().min(1)).default([]).optional(),
    parallel_group: z.string().min(1).optional(),
    agent: z.string().min(1),
    model_tier: ModelTierSchema.optional(),
    effort: EffortSchema.optional(),
    contract: WorkflowContractSchema,
  })
  .strict();

export const WorkflowCompletionHookSchema = z.enum([
  "prompt_memory_promotion",
  "write_artifact_index",
]);

export const WorkflowDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().regex(SEMVER_RE).default("1.0.0").optional(),
    defaults: WorkflowDefaultsSchema.optional(),
    approval_gates: z.array(ApprovalGateSchema).default([]).optional(),
    phases: z.array(WorkflowPhaseSchema).min(1),
    on_workflow_complete: z.array(WorkflowCompletionHookSchema).default([]).optional(),
  })
  .strict();

export type WorkflowDefaults = z.infer<typeof WorkflowDefaultsSchema>;
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;
export type WorkflowContract = z.infer<typeof WorkflowContractSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowCompletionHook = z.infer<typeof WorkflowCompletionHookSchema>;

export interface WorkflowValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface WorkflowValidationResult {
  valid: boolean;
  workflow: WorkflowDefinition | null;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

export interface WorkflowSourceEntry {
  name: string;
  description: string;
  source: "project" | "bundled" | "path";
  path: string;
  workflow: WorkflowDefinition;
}

export function parseSemverMajor(version: string | undefined): number {
  if (!version) {
    return 1;
  }
  const [major] = version.split(".");
  return Number(major);
}

export function validateWorkflowDefinition(
  raw: unknown,
  options: {
    engineVersion?: string;
  } = {}
): WorkflowValidationResult {
  const parsed = WorkflowDefinitionSchema.safeParse(raw);
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        path: issue.path.join(".") || "<root>",
        message: issue.message,
        severity: "error",
      });
    }
    return { valid: false, workflow: null, errors, warnings };
  }

  const workflow = parsed.data;
  const phaseMap = new Map<string, WorkflowPhase>();

  for (const phase of workflow.phases) {
    if (phaseMap.has(phase.id)) {
      errors.push({
        path: `phases.${phase.id}`,
        message: `Duplicate phase id "${phase.id}".`,
        severity: "error",
      });
    }
    phaseMap.set(phase.id, phase);

    const outputNames = new Set<string>();
    for (const output of phase.contract.outputs) {
      if (outputNames.has(output.name)) {
        errors.push({
          path: `phases.${phase.id}.contract.outputs`,
          message: `Duplicate output "${output.name}" in phase "${phase.id}".`,
          severity: "error",
        });
      }
      outputNames.add(output.name);
    }

    if (!KNOWN_AGENTS.has(phase.agent.toLowerCase())) {
      warnings.push({
        path: `phases.${phase.id}.agent`,
        message: `Unrecognized agent "${phase.agent}". Hosts may fall back to general-purpose.`,
        severity: "warning",
      });
    }
  }

  for (const phase of workflow.phases) {
    for (const dependency of phase.depends_on ?? []) {
      if (!phaseMap.has(dependency)) {
        errors.push({
          path: `phases.${phase.id}.depends_on`,
          message: `Phase "${phase.id}" depends on unknown phase "${dependency}".`,
          severity: "error",
        });
      }
      if (dependency === phase.id) {
        errors.push({
          path: `phases.${phase.id}.depends_on`,
          message: `Phase "${phase.id}" cannot depend on itself.`,
          severity: "error",
        });
      }
    }
  }

  const parallelGroups = new Map<string, string[]>();
  for (const phase of workflow.phases) {
    if (!phase.parallel_group) {
      continue;
    }
    const members = parallelGroups.get(phase.parallel_group) ?? [];
    members.push(phase.id);
    parallelGroups.set(phase.parallel_group, members);
  }

  for (const [group, members] of parallelGroups) {
    if (members.length < 2) {
      warnings.push({
        path: `parallel_group.${group}`,
        message: `Parallel group "${group}" has only one phase.`,
        severity: "warning",
      });
      continue;
    }

    const baseline = [...(phaseMap.get(members[0])?.depends_on ?? [])].sort().join(",");
    for (const memberId of members.slice(1)) {
      const current = [...(phaseMap.get(memberId)?.depends_on ?? [])].sort().join(",");
      if (baseline !== current) {
        errors.push({
          path: `parallel_group.${group}`,
          message: `All phases in parallel group "${group}" must share the same depends_on set.`,
          severity: "error",
        });
        break;
      }
    }
  }

  for (const gate of workflow.approval_gates ?? []) {
    if (!phaseMap.has(gate.after)) {
      errors.push({
        path: "approval_gates",
        message: `Approval gate references unknown phase "${gate.after}".`,
        severity: "error",
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (phaseId: string) => {
    if (visiting.has(phaseId)) {
      errors.push({
        path: `phases.${phaseId}.depends_on`,
        message: `Dependency cycle detected at phase "${phaseId}".`,
        severity: "error",
      });
      return;
    }
    if (visited.has(phaseId)) {
      return;
    }

    visiting.add(phaseId);
    for (const dependency of phaseMap.get(phaseId)?.depends_on ?? []) {
      if (phaseMap.has(dependency)) {
        visit(dependency);
      }
    }
    visiting.delete(phaseId);
    visited.add(phaseId);
  };

  for (const phase of workflow.phases) {
    visit(phase.id);
  }

  const workflowMajor = parseSemverMajor(workflow.version);
  const engineMajor = parseSemverMajor(options.engineVersion ?? "1.0.0");
  if (workflowMajor > engineMajor) {
    errors.push({
      path: "version",
      message: `Workflow major version ${workflowMajor} exceeds engine major version ${engineMajor}.`,
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    workflow,
    errors,
    warnings,
  };
}

export function buildWorkflowLayers(workflow: WorkflowDefinition): string[][] {
  const phaseIds = workflow.phases.map((phase) => phase.id);
  const inDegree = new Map<string, number>();
  const graph = new Map<string, Set<string>>();

  for (const phase of workflow.phases) {
    graph.set(phase.id, new Set());
    inDegree.set(phase.id, phase.depends_on?.length ?? 0);
  }

  for (const phase of workflow.phases) {
    for (const dependency of phase.depends_on ?? []) {
      graph.get(dependency)?.add(phase.id);
    }
  }

  const processed = new Set<string>();
  const layers: string[][] = [];
  let frontier = phaseIds.filter((id) => (inDegree.get(id) ?? 0) === 0);

  while (frontier.length > 0) {
    layers.push([...frontier]);
    const next: string[] = [];
    for (const phaseId of frontier) {
      processed.add(phaseId);
      for (const dependent of graph.get(phaseId) ?? []) {
        const nextDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, nextDegree);
        if (nextDegree === 0) {
          next.push(dependent);
        }
      }
    }
    frontier = next;
  }

  if (processed.size !== phaseIds.length) {
    throw new Error("Unable to build workflow layers due to a dependency cycle.");
  }

  return layers;
}

export function resolvePhaseDefaults(
  workflow: WorkflowDefinition,
  phase: WorkflowPhase
): {
  model_tier: z.infer<typeof ModelTierSchema>;
  effort: z.infer<typeof EffortSchema>;
  memory_scope: z.infer<typeof ScopeSchema>[];
  knowledge_scope: z.infer<typeof ScopeSchema>[];
} {
  const defaults = workflow.defaults ?? {};
  return {
    model_tier: phase.model_tier ?? defaults.model_tier ?? "standard",
    effort: phase.effort ?? defaults.effort ?? "medium",
    memory_scope: defaults.memory_scope ?? ["run", "project"],
    knowledge_scope: defaults.knowledge_scope ?? ["project"],
  };
}

export function getWorkflowPhase(
  workflow: WorkflowDefinition,
  phaseId: string
): WorkflowPhase {
  const phase = workflow.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase "${phaseId}" in workflow "${workflow.name}".`);
  }
  return phase;
}

export function getUpstreamPhaseIds(
  workflow: WorkflowDefinition,
  phaseId: string
): string[] {
  const phase = getWorkflowPhase(workflow, phaseId);
  return [...(phase.depends_on ?? [])];
}
