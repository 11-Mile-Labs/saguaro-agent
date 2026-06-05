# Workflow run resume (RFC)

Status: accepted  
Decision: Option B — opaque `run_id` with a ticket run index under `.saguaro/runs/`.

## Problem

`workflow_start` always created a fresh run. When hosts passed `ticket_slug`, that slug became `run_id`, so a second start overwrote prior state instead of resuming.

## Design

### Run identifiers

- Every new run gets an **opaque** `run_id`: `{workflow_name}-{timestamp}-{uuid6}`.
- `ticket_slug` remains in `workflow_args` for dispatch contracts; it is **not** the directory name.

### Ticket run index

Saguaro stores a project-local index so hosts do not need ticket-specific paths:

```
.saguaro/runs/_by-ticket/{workflow_name}__{ticket_slug}.json
```

Entry shape:

```json
{
  "run_id": "engineering-standard-20260523T161045Z-a1b2c3",
  "workflow_name": "engineering-standard",
  "ticket_slug": "my-ticket",
  "started_at": "2026-05-23T16:10:45.000Z",
  "completed_at": null
}
```

The index key namespaces by `(workflow_name, ticket_slug)` so `engineering-lite` and `engineering-standard` never collide.

Slugs are sanitized for filenames: non `[A-Za-z0-9._-]` characters become `_`.

### Start-or-resume policy

| `resume` | Behavior |
| --- | --- |
| `"auto"` (default) | Return the indexed incomplete run for `(workflow_name, ticket_slug)`; otherwise create a new run and update the index. |
| `true` | Return the indexed incomplete run or error if none exists. |
| `false` | Always create a new run and point the index at it (prior incomplete run directories remain on disk). |

Explicit `run_id` on `workflow_start`:

- If the run exists and `workflow_name` matches, return it.
- If it does not exist, create a run with that id (advanced / host-managed handoff).

### Completed runs

When `completed_at` is set (via dispatch finishing all phases or `workflow_complete`), the index entry records `completed_at`. A subsequent `workflow_start` with `resume: "auto"` creates a **new** run — supporting re-runs after completion.

### MCP surface

| Tool | Role |
| --- | --- |
| `workflow_start` | Primary host entry point; accepts `resume`, optional `run_id`, and optional `workflow_path`. |
| `workflow_find_run` | Lookup by `ticket_slug` (+ optional `workflow_name`); `include_completed` for status UIs. |
| `workflow_resume` | Shorthand for `workflow_start` with `resume: true`. |

Hosts should call `workflow_start` once in setup; no separate resume slash command is required.

### Path-sourced workflows

Hosts may pass `workflow_path` to start from a concrete YAML file instead of a
workflow registered in `workflow_list`. Relative paths resolve under `project_path`;
absolute paths are read directly subject to host filesystem policy. The requested
`name` must match the YAML `name`, keeping run indexes and resume behavior
unambiguous.

Saguaro stores source metadata in `_status.json` and snapshots the validated
workflow definition in `_workflow.json`. Resume uses that snapshot, so source-file
changes do not drift an in-progress run. This allows hosts to generate per-run
workflows with private or branded wording while Saguaro core remains neutral and
does not own that vocabulary.

### Non-goals

- No `ticket_path` or consumer queue roots in public MCP.
- No assumption about `.engineering/_active/` or other host ticket layouts.
- Optional ticket frontmatter `saguaro_run_id` is a host convention; Saguaro resolves by index when `ticket_slug` is provided.
