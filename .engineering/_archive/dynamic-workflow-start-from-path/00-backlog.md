---
title: "Support workflow_start from an explicit workflow YAML path"
slug: dynamic-workflow-start-from-path
type: enhancement
priority: medium
complexity: medium
status: shipped
created: "2026-06-05"
source: host-plugin-dogfood
---

# Support `workflow_start` from an explicit workflow YAML path

## Problem

Some host plugins need to generate workflow DAGs at runtime from private or branded
project concepts, then hand the resulting workflow to Saguaro for neutral execution.
Today `workflow_start` starts by workflow name, resolving from bundled and
project-local workflow directories. That works for stable workflows, but it makes
per-run generated workflows awkward unless the host first writes them into a
discoverable workflow directory under a stable name.

Saguaro should stay vendor-neutral and should not bake in host-specific naming,
themes, or alias semantics. At the same time, it should be able to execute a
valid workflow YAML file supplied by a host as dynamic content.

## Proposal

Add an explicit workflow-path start option, for example:

```ts
workflow_start({
  name: "generated-security-review",
  workflow_path: ".saguaro/generated/workflows/generated-security-review.yaml",
  args: { ticket_slug, ticket_description },
  project_path,
});
```

The path points to a concrete workflow YAML file. Saguaro validates and snapshots
that workflow into the run state, then proceeds through normal dispatch,
validation, logging, artifact recording, resume, and completion behavior.

## Acceptance criteria

- [ ] `workflow_start` accepts an optional `workflow_path` argument.
- [ ] Relative paths resolve under `project_path`; absolute paths are accepted only when allowed by existing filesystem policy.
- [ ] The referenced YAML is validated with the same schema and semantic rules as bundled/project workflows.
- [ ] Run state snapshots the exact resolved workflow content so later resume does not drift if the source file changes.
- [ ] `workflow_status` and dispatch logs identify the run as path-sourced without requiring the workflow to appear in `workflow_list`.
- [ ] Documentation explains that Saguaro may execute caller-provided prose or theme-specific wording, but Saguaro core remains neutral and does not own that vocabulary.

## Non-goals

- Do not add theme-specific or host-specific concepts to Saguaro schema or bundled workflows.
- Do not require generated workflows to be copied into the bundled `workflows/` directory.
- Do not change the existing named workflow resolution behavior.

## Implementation notes

- Promoted: 2026-06-05
- Shipped: 2026-06-05
