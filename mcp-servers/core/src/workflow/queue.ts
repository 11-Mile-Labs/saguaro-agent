import type { WorkflowRunStatus } from "./runtime.js";
import type { WorkflowDefinition } from "./types.js";

function phaseMarker(status: WorkflowRunStatus, phaseId: string): string {
  if (status.completed_phases.includes(phaseId)) {
    return "[x]";
  }
  if (status.running_phases.includes(phaseId)) {
    return "[>]";
  }
  return "[ ]";
}

export function renderRunQueueMarkdown(
  status: WorkflowRunStatus,
  workflow: WorkflowDefinition
): string {
  const lines: string[] = [
    "---",
    `run_id: ${status.run_id}`,
    `workflow_name: ${status.workflow_name}`,
    `status: ${status.completed_at ? "completed" : status.running_phases.length > 0 ? "running" : "pending"}`,
    `current_layer: ${status.current_layer}`,
    `completed_phases: [${status.completed_phases.join(", ")}]`,
    `pending_phases: [${status.pending_phases.join(", ")}]`,
    `running_phases: [${status.running_phases.join(", ")}]`,
    "---",
    "",
    `# Workflow Queue: ${workflow.name}`,
    "",
  ];

  for (const phase of workflow.phases) {
    const dependencies = phase.depends_on?.length
      ? ` (depends on: ${phase.depends_on.join(", ")})`
      : "";
    lines.push(`${phaseMarker(status, phase.id)} ${phase.id}${dependencies}`);
  }

  if (status.approval_gates_pending.length > 0) {
    lines.push("", "## Pending Approval Gates", "");
    for (const gate of status.approval_gates_pending) {
      lines.push(`- after ${gate.after}: ${gate.prompt}`);
    }
  }

  if (status.validation_failures.length > 0) {
    lines.push("", "## Validation Failures", "");
    for (const failure of status.validation_failures) {
      lines.push(`- ${failure.phase_id}: ${failure.errors.join("; ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
