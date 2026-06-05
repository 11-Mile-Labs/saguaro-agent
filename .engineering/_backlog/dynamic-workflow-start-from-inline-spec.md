---
title: "Support workflow_start from an inline workflow document"
slug: dynamic-workflow-start-from-inline-spec
type: enhancement
priority: low
complexity: high
status: backlog
created: "2026-06-05"
source: host-plugin-dogfood
---

# Support `workflow_start` from an inline workflow document

## Problem

Runtime workflow generators may not always want to write a workflow YAML file
before starting a run. A host plugin can already compile private, branded, or
project-specific concepts into a neutral Saguaro DAG, but today Saguaro's public
start path is name-based. A fully dynamic caller may prefer to pass the parsed
workflow document directly to `workflow_start`.

This is useful for generated workflows whose lifecycle is exactly one run, or
for hosts that want their own storage and provenance layer while letting Saguaro
own execution, dispatch, validation, and run state.

## Proposal

Add an inline workflow start option, for example:

```ts
workflow_start({
  name: "generated-security-review",
  workflow: {
    name: "generated-security-review",
    description: "Generated workflow supplied by the host project.",
    version: "1.0.0",
    phases: [/* validated workflow phases */],
  },
  args: { ticket_slug, ticket_description },
  project_path,
});
```

Saguaro validates the supplied document, snapshots it into the run directory,
and treats it like any other workflow for dispatch and resume.

## Acceptance criteria

- [ ] `workflow_start` accepts an optional inline `workflow` document.
- [ ] Inline workflows use the same schema and semantic validation as YAML workflows.
- [ ] The inline document is persisted into run state before the first phase dispatch.
- [ ] Resume uses the persisted run workflow, not a recomputed caller-provided document.
- [ ] Validation errors are returned clearly and do not create partial run state.
- [ ] `workflow_status` indicates that the run was started from an inline workflow document.
- [ ] Documentation describes this as an advanced/dynamic workflow API and recommends `workflow_path` for simpler generated-file integrations.

## Non-goals

- Do not make Saguaro responsible for host-specific alias expansion or themed vocabulary.
- Do not allow inline workflows to bypass schema, semantic, memory, knowledge, dispatch, or approval-gate validation.
- Do not remove or deprecate named workflow startup.

## Open questions

- Should inline workflow startup be gated by a size limit to avoid oversized MCP payloads?
- Should inline workflow documents be accepted as parsed objects only, or also as raw YAML strings?
