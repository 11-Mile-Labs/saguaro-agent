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
| `workflow_start` | Primary host entry point; accepts `resume` and optional `run_id`. |
| `workflow_find_run` | Lookup by `ticket_slug` (+ optional `workflow_name`); `include_completed` for status UIs. |
| `workflow_resume` | Shorthand for `workflow_start` with `resume: true`. |

Hosts should call `workflow_start` once in setup; no separate resume slash command is required.

### Non-goals

- No `ticket_path` or consumer queue roots in public MCP.
- No assumption about `.engineering/_active/` or other host ticket layouts.
- Optional ticket frontmatter `saguaro_run_id` is a host convention; Saguaro resolves by index when `ticket_slug` is provided.
