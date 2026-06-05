# Workflow Authoring

Saguaro workflows turn a good team habit into a portable agent contract. A workflow says what phases exist, what each phase needs, what it must produce, when the user must approve the plan, and when memory or knowledge retrieval is mandatory.

Use bundled workflows when they fit. Create a project-local workflow when your team has a repeatable process that deserves its own shape.

## When To Create A Workflow

Create a workflow when the work has a recurring path:

- Support triage that always needs reproduction, customer impact, root cause, fix plan, and follow-up.
- Release work that always needs scope, risk review, changelog, verification, and publish steps.
- Data migration work that always needs inventory, migration design, rollback plan, dry run, execution, and audit.
- Content work that always needs research, outline, draft, editorial review, implementation, and measurement.

Do not create a workflow for one-off task notes, tiny TODOs, or situations where a simple prompt is clearer.

## The Authoring Loop

1. Name the workflow with a stable kebab-case identifier.
2. Write the one-sentence description.
3. Identify the required starting inputs, usually `ticket_slug` and `ticket_description`.
4. List the phases in execution order.
5. Add `depends_on` edges only where a phase needs upstream outputs.
6. Mark memory and knowledge requirements on phases where prior context matters.
7. Add an approval gate before irreversible or expensive work.
8. Validate the YAML.
9. Run it once on a small ticket and tighten the contract.

Use the bundled skill when you want guided authoring:

```text
/create-workflow release-readiness
```

## Minimal Workflow

```yaml
name: support-triage
description: "Triage a support issue from report to follow-up plan."
version: "1.0.0"
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
        - ticket_description: required
      outputs:
        - issue_summary: required
        - affected_user_path: required
  - id: reproduce
    depends_on: [intake]
    agent: explore
    contract:
      inputs: [issue_summary, affected_user_path]
      outputs: [repro_steps, observed_behavior, expected_behavior]
      requires_memory_query: true
      requires_knowledge_query: true
  - id: response-plan
    depends_on: [reproduce]
    agent: planner
    contract:
      inputs: [issue_summary, repro_steps, observed_behavior, expected_behavior]
      outputs: [customer_response, fix_or_workaround_plan]
on_workflow_complete:
  - write_artifact_index
```

## Workflow With Parallel Discovery

Use `parallel_group` when phases can run at the same time and share the same dependency set.

```yaml
name: release-readiness
description: "Check a release slice before publishing."
version: "1.0.0"
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
approval_gates:
  - after: risk-review
    prompt: "Approve the release plan before publish prep?"
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
        - ticket_description: required
      outputs: [release_goal, release_scope]
  - id: changelog
    depends_on: [intake]
    parallel_group: release-discovery
    agent: docs-writer
    contract:
      inputs: [release_goal, release_scope]
      outputs: [changelog_draft]
      requires_knowledge_query: true
  - id: verification
    depends_on: [intake]
    parallel_group: release-discovery
    agent: code-reviewer
    contract:
      inputs: [release_goal, release_scope]
      outputs: [verification_matrix]
      requires_memory_query: true
  - id: risk-review
    depends_on: [changelog, verification]
    agent: devils-advocate
    model_tier: deep
    contract:
      inputs: [changelog_draft, verification_matrix]
      outputs: [risk_brief, approve]
  - id: publish-prep
    depends_on: [risk-review]
    agent: implementer
    contract:
      inputs: [risk_brief]
      outputs: [publish_steps, rollback_notes]
on_workflow_complete:
  - prompt_memory_promotion
  - write_artifact_index
```

## Workflow With An Explicit File Path

Agents can run a workflow that is not registered in the catalog by passing `workflow_path` to `workflow_start`. The YAML `name` must match the requested `name`.

```text
Start workflow "release-readiness" from .saguaro/workflows/release-readiness.yaml for ticket june-patch.
```

Saguaro validates and snapshots the workflow into `.saguaro/runs/<run-id>/`, so resuming a run uses the workflow definition that started the run even if the source YAML changes later.

## Validation Commands

From this repository:

```bash
node scripts/lint-workflow-yaml.mjs
```

From a Saguaro-enabled project that has local workflows:

```text
Call workflow_validate_yaml with path ".saguaro/workflows/release-readiness.yaml" and project_path set to the target project root.
```

From a source checkout of this repository:

```bash
node scripts/lint-workflow-yaml.mjs --user
```

## Design Checklist

- Keep `name` stable; downstream run indexes use it.
- Keep phase `id` values stable once teams depend on artifacts.
- Start with fewer phases and stronger contracts.
- Use `requires_memory_query` when repeated lessons could change the phase.
- Use `requires_knowledge_query` when docs, decisions, specs, or references could change the phase.
- Add approval gates before code changes, publish steps, migrations, data deletion, or user-visible commitments.
- Use optional outputs for useful-but-not-guaranteed data, not for core phase success criteria.
- Prefer logical model tiers over concrete model names inside workflow YAML.
- Validate before committing workflow files.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| A phase consumes an input that no ancestor produces. | Add the missing dependency or change the input to an ancestor output. |
| A parallel group has mismatched `depends_on` sets. | Make every member of the group depend on the same phases. |
| A gate references a typoed phase id. | Point `approval_gates.after` at a real phase id. |
| A workflow bakes in one harness model name. | Put model names in `.saguaro/config.yaml` `model_tiers` instead. |
| Every phase requires every tool. | Require memory and knowledge only where the result can change the work. |
