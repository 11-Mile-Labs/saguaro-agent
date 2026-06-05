---
name: create-workflow
description: "Guide a user through defining a new Saguaro workflow YAML, then write and validate the project-local workflow."
argument-hint: "[workflow-name]"
license: MIT
---

# Create Workflow

Use this skill when the user asks to create, design, draft, or refine a Saguaro workflow. This includes requests for `createWorkflow`.

## When Users Should Invoke This Skill

Invoke `create-workflow` when a team has a repeatable process that should become a project-local workflow.

Good fits:

- support triage
- release readiness
- migration planning
- content production
- customer escalation
- project-specific engineering review

Avoid it for one-off task lists or tiny prompts that do not need reusable workflow state.

## User Prompts

```text
/create-workflow support-triage
```

```text
Use create-workflow to help me design a release-readiness workflow.
```

```text
Create a workflow for data migrations with inventory, dry run, approval, execution, and audit phases.
```

## Goal

Help the user turn a repeatable process into `.saguaro/workflows/<name>.yaml`.

The skill should ask enough questions to produce a valid workflow, but it should not force a long interview when the user already gave a clear spec.

## Discovery

1. Confirm the project has `.saguaro/config.yaml`. If it does not, recommend `/saguaro init` first.
2. Resolve the target project root and pass it as `project_path` to Saguaro workflow tools.
3. Call `workflow_list(project_path: <target project root>)` when available so you can avoid duplicating a bundled workflow by accident.
4. Read `docs/workflow-yaml-schema.md` and `docs/workflow-authoring.md` if the schema details are not already in context.

## Questions

Ask concise questions only for missing decisions:

1. Workflow name and purpose.
2. First-run inputs, usually `ticket_slug` and `ticket_description`.
3. Phase list in order, with the goal of each phase.
4. Which phases need memory retrieval.
5. Which phases need knowledge search or synthesis.
6. Where approval is required before expensive, risky, or user-visible work.
7. Whether any phases can run in parallel.

If the user gives a loose goal, propose a first draft and ask for confirmation before writing. If the user gives a complete phase list, write directly.

## Drafting Rules

- Use kebab-case for the workflow file name, workflow `name`, and phase `id` values.
- Use `version: "1.0.0"` for new workflows.
- Prefer `defaults.model_tier: standard`, `defaults.effort: medium`, `defaults.memory_scope: [run, project]`, and `defaults.knowledge_scope: [project]`.
- Use logical agent roles from the public examples when possible: `general-purpose`, `explore`, `planner`, `architect`, `impact-analyzer`, `devils-advocate`, `implementer`, `code-reviewer`, `docs-writer`.
- Keep phase contracts concrete. Outputs should be artifact names that a later phase can consume.
- Mark optional fields with `field_name: optional`; required string entries can be plain `field_name` or `field_name: required`.
- Add `requires_memory_query: true` where prior lessons can change the phase.
- Add `requires_knowledge_query: true` where documents, specs, references, or decisions can change the phase.
- Add `on_workflow_complete: [prompt_memory_promotion, write_artifact_index]` for most workflows that produce durable artifacts.

## Writing

1. Create `.saguaro/workflows/` if needed.
2. If `.saguaro/workflows/<name>.yaml` already exists, ask before overwriting it.
3. Write the workflow to `.saguaro/workflows/<name>.yaml`.
4. Call `workflow_validate_yaml(path: ".saguaro/workflows/<name>.yaml", project_path: <target project root>)` when available.
5. If MCP validation is unavailable, run `node scripts/lint-workflow-yaml.mjs --user` from the Saguaro repository when that path is known.
6. Fix validation errors before finalizing. If no validation method is available, say that clearly and include the unvalidated file path.

## Final Response

Summarize:

- workflow file path
- phases created
- approval gates
- memory and knowledge requirements
- validation result
- first command to run, for example `/workflow run support-triage --ticket first-ticket`
