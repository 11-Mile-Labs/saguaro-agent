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

Project-local workflows shadow bundled workflows by `name`.

Bundled workflows are reusable defaults. User project workflows may override
them by defining the same `name` in `.saguaro/workflows/*.yaml`; when names
collide, the project-local workflow wins.

## Example

```yaml
name: engineering
description: Full engineering workflow from intake through docs
version: 1.0.0

defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]

approval_gates:
  - after: da
    prompt: "Approve architecture before implementation?"

phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_description: required
      outputs:
        - intake_summary: required

  - id: research
    depends_on: [intake]
    agent: explore
    model_tier: deep
    contract:
      inputs: [intake_summary]
      outputs: [research_brief]
      requires_memory_query: true
      requires_knowledge_query: true
```

## Core Fields

| Field | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Workflow identifier used by `workflow_start`. |
| `description` | Yes | Short human-readable summary. |
| `version` | Recommended | Workflow semver. |
| `defaults` | No | Shared defaults for phase settings. |
| `approval_gates` | No | User confirmation checkpoints. |
| `phases` | Yes | Ordered phase definitions with DAG dependencies. |

## Phase Fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Unique phase identifier within the workflow. |
| `depends_on` | No | Upstream phase IDs. |
| `parallel_group` | No | Shared label for phases that can run together. |
| `agent` | Yes | Logical role string resolved by the host harness. |
| `model_tier` | No | Phase-specific override of the logical model tier. |
| `effort` | No | Phase-specific effort hint. |
| `contract.inputs` | Yes | Named inputs required from workflow args or prior phases. |
| `contract.outputs` | Yes | Named outputs the phase must produce. |
| `contract.requires_memory_query` | No | Forces a `memory_*` retrieval before the phase can validate. |
| `contract.requires_knowledge_query` | No | Forces a `knowledge_*` retrieval before the phase can validate. |

## Contract Enforcement

Saguaro validates required outputs and required Saguaro tool calls after each phase. This is where the 1% rule becomes executable policy instead of documentation alone.

## Bundled Workflow Overrides

Saguaro discovers bundled workflow YAML from `workflows/*.yaml` first, then
loads project-local YAML from `.saguaro/workflows/*.yaml`. Project-local
definitions shadow bundled definitions by workflow `name`. This lets Saguaro
ship generic workflows such as `engineering-lite`, `engineering-standard`, and
`engineering-deep` while allowing a project to tune agent roles, phase
contracts, or gate prompts without forking the bundled library.

## Linting Expectations

The repository intends to ship a workflow YAML linter that checks:

- schema validity
- dependency cycles
- unresolved references
- contract integrity
- approval gate references
- workflow name collisions
