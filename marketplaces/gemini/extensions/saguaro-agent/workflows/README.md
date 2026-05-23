# Bundled Workflows

These workflow files are the bundled reference library for Saguaro v1.

## Workflow selection

| Workflow | Use When | Avoid When |
|---|---|---|
| `engineering-lite` | Simple local enhancements, obvious bug-adjacent changes, no schema or architecture uncertainty | unknown blast radius, data migration, security-sensitive change |
| `engineering-standard` | Default feature/enhancement workflow | project-wide migration or major architecture decision |
| `engineering-deep` | migrations, cross-package changes, security-sensitive changes, unclear or high-risk tickets | routine feature work |

`engineering-standard` and `engineering-deep` require a documentation phase. The artifact can be an ADR, note, changelog, runbook update, or other durable project record. Use `engineering-lite` only for the simplest changes where a durable docs artifact would be noise.

## Ground rules

- Keep one workflow per file.
- Use only `workflow_*`, `memory_*`, and `knowledge_*` tool families in companion skills.
- Model tiers, effort, and scopes belong in workflow defaults unless a phase genuinely needs an override.
- If a phase requires memory or knowledge, set `requires_memory_query: true` or `requires_knowledge_query: true` so validation can enforce the 1% rule.

## DAG rules

- Every `depends_on` entry must reference an earlier phase by `id`.
- Phases in the same `parallel_group` must share the same `depends_on` set.
- Contract inputs must resolve from workflow args or outputs produced by ancestor phases.
- Approval gates must reference a real phase id.

## Minimal shape

```yaml
name: custom-workflow
description: "One-line summary."
version: "1.0.0"
defaults:
  model_tier: standard
  effort: medium
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
      outputs:
        - intake_summary: required
```

## Validation

Run the bundled linter from the repo root:

```bash
node scripts/lint-workflow-yaml.mjs
```

To validate only a project-local workflow directory:

```bash
node scripts/lint-workflow-yaml.mjs --user
```
