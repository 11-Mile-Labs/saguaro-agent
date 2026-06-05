# Workflow YAML Schema

Saguaro uses one YAML file per workflow.

Project-local workflows live in:

```text
.saguaro/workflows/*.yaml
```

Bundled reference workflows live in:

```text
workflows/*.yaml
```

Project-local workflows shadow bundled workflows by `name`. This lets a project customize a workflow without editing plugin files.

## Complete Example

```yaml
name: engineering-standard
description: "Default engineering workflow with composite planning and required documentation."
version: "1.0.0"
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
approval_gates:
  - after: da
    prompt: "Approve the implementation plan before code changes?"
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
        - ticket_description: required
      outputs:
        - intake_summary: required
        - scope_class: required
        - acceptance_criteria: required
  - id: plan
    depends_on: [intake]
    agent: planner
    model_tier: deep
    effort: high
    contract:
      inputs: [intake_summary, scope_class, acceptance_criteria]
      outputs:
        - research_findings
        - architecture_doc
        - affected_areas
        - implementation_plan
        - verification_plan
        - specialist_escalations: optional
      requires_memory_query: true
      requires_knowledge_query: true
  - id: da
    depends_on: [plan]
    agent: devils-advocate
    model_tier: deep
    contract:
      inputs:
        - research_findings
        - architecture_doc
        - affected_areas
        - implementation_plan
        - verification_plan
        - specialist_escalations: optional
      outputs: [da_doc, approve]
  - id: implement
    depends_on: [da]
    agent: implementer
    effort: high
    contract:
      inputs: [implementation_plan, da_doc]
      outputs: [implementation_summary, files_changed, verification]
      requires_memory_query: true
  - id: review
    depends_on: [implement]
    agent: code-reviewer
    contract:
      inputs: [implementation_summary, files_changed, verification]
      outputs: [review_doc, review_outcome]
  - id: docs
    depends_on: [review]
    agent: docs-writer
    contract:
      inputs:
        - intake_summary
        - research_findings
        - architecture_doc
        - affected_areas
        - implementation_plan
        - da_doc
        - implementation_summary
        - verification
        - review_doc
      outputs: [docs_summary, knowledge_captures]
      requires_memory_query: true
      requires_knowledge_query: true
on_workflow_complete:
  - prompt_memory_promotion
  - write_artifact_index
```

## Top-Level Schema

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | none | Workflow identifier used by `workflow_start`. Keep it stable and kebab-case. |
| `description` | string | Yes | none | Short human-readable summary. |
| `version` | semver string | No | `1.0.0` | Must match `x.y.z`. Workflow major version cannot exceed engine major version. |
| `defaults` | object | No | see below | Shared defaults for phase runtime settings. |
| `approval_gates` | array | No | `[]` | User confirmation checkpoints triggered after named phases. |
| `phases` | array | Yes | none | Ordered phase definitions. Must contain at least one phase. |
| `on_workflow_complete` | array | No | `[]` | Completion hooks executed after all phases finish. |

Unknown top-level fields are invalid.

## `defaults`

```yaml
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
```

| Field | Type | Default | Allowed Values |
| --- | --- | --- | --- |
| `model_tier` | string | `standard` | `standard`, `deep`, `surgeon` |
| `effort` | string | `medium` | `low`, `medium`, `high` |
| `memory_scope` | string array | `[run, project]` | `run`, `project`, `global` |
| `knowledge_scope` | string array | `[project]` | Use `project` and `global`; `run` is reserved for future run-scoped knowledge behavior. |

Use `model_tier` for logical model intent. Concrete model names live in `.saguaro/config.yaml` `model_tiers`.

## `approval_gates`

```yaml
approval_gates:
  - after: da
    prompt: "Approve the implementation plan before code changes?"
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `after` | string | Yes | Phase id that must finish before this gate triggers. |
| `prompt` | string | Yes | User-facing approval question. |

The `after` value must reference a real phase. A gate should appear before irreversible, expensive, user-visible, or risky work.

## `phases`

```yaml
phases:
  - id: research
    depends_on: [intake]
    parallel_group: discovery
    agent: explore
    model_tier: deep
    effort: high
    contract:
      inputs: [intake_summary]
      outputs: [research_brief]
      requires_memory_query: true
      requires_knowledge_query: true
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | none | Unique phase identifier within the workflow. |
| `depends_on` | string array | No | `[]` | Upstream phase ids that must complete first. |
| `parallel_group` | string | No | none | Shared label for phases that can dispatch together. |
| `agent` | string | Yes | none | Logical role string resolved by the host harness. |
| `model_tier` | string | No | workflow default | Phase-specific model tier. |
| `effort` | string | No | workflow default | Phase-specific effort hint. |
| `contract` | object | Yes | none | Inputs, outputs, and required Saguaro lookups. |

Recognized public agent role examples:

- `general-purpose`
- `explore`
- `explorer`
- `planner`
- `architect`
- `code-reviewer`
- `impact-analyzer`
- `devils-advocate`
- `implementer`
- `docs-writer`

Unknown agent names produce warnings, not errors. Hosts may fall back to a general-purpose executor.

## `contract`

```yaml
contract:
  inputs:
    - ticket_slug: required
    - research_targets: optional
  outputs:
    - research_findings
    - specialist_escalations: optional
  requires_memory_query: true
  requires_knowledge_query: true
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `inputs` | field array | No | `[]` | Values required from workflow args or ancestor phase outputs. |
| `outputs` | field array | No | `[]` | Values this phase must produce. |
| `requires_memory_query` | boolean | No | `false` | Requires a successful `memory_retrieve` in the phase dispatch log. |
| `requires_knowledge_query` | boolean | No | `false` | Requires a successful `knowledge_search` or `knowledge_query` in the phase dispatch log. |

Field arrays accept these equivalent shapes:

```yaml
outputs:
  - implementation_summary
  - files_changed: required
  - specialist_escalations: optional
```

Plain strings are required by default.

## `on_workflow_complete`

```yaml
on_workflow_complete:
  - prompt_memory_promotion
  - write_artifact_index
```

Allowed hooks:

| Hook | Purpose |
| --- | --- |
| `prompt_memory_promotion` | Surface memories that may deserve promotion to a broader scope. |
| `write_artifact_index` | Write an artifact index for the completed run. |

## Semantic Validation Rules

Saguaro validates more than YAML shape:

- Phase ids must be unique.
- Required output names must be unique inside each phase.
- `depends_on` entries must reference real phase ids.
- A phase cannot depend on itself.
- Dependency cycles are invalid.
- Every approval gate must reference a real phase.
- Every phase in a `parallel_group` must have the same `depends_on` set.
- Workflow major version cannot exceed the Saguaro engine major version.
- Contract inputs should resolve from workflow args or ancestor outputs when checked by the linter.

## Discovery And Shadowing

Workflow discovery loads bundled workflows first, then project workflows:

1. bundled `workflows/*.yaml`
2. project-local `.saguaro/workflows/*.yaml`

If both define `name: engineering-lite`, the project-local definition wins.

## Running A Workflow

Start by catalog name:

```text
/workflow run engineering-standard --ticket add-bulk-actions
```

Start by explicit path:

```text
Call workflow_start with name "release-readiness", workflow_path ".saguaro/workflows/release-readiness.yaml", and args {"ticket_slug":"june-release","ticket_description":"Prepare the June release notes"}.
```

Resume by ticket:

```text
Call workflow_resume with workflow_name "engineering-standard" and ticket_slug "add-bulk-actions".
```

With `ticket_slug` and default `resume: auto`, `workflow_start` returns an existing incomplete run instead of wiping state.

## Validation

From this repository:

```bash
node scripts/lint-workflow-yaml.mjs
```

For project-local workflows only:

```bash
node scripts/lint-workflow-yaml.mjs --user
```

From an installed harness:

```text
Call workflow_validate_yaml with path ".saguaro/workflows/support-triage.yaml".
```

## More Examples

See:

- [workflow-authoring.md](./workflow-authoring.md)
- [../workflows/README.md](../workflows/README.md)
- [../examples/custom-workflow-demo/README.md](../examples/custom-workflow-demo/README.md)
