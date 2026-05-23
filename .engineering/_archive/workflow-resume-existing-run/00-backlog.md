---
title: "Resume incomplete workflow runs by ticket"
slug: workflow-resume-existing-run
type: enhancement
priority: high
complexity: medium
status: done
created: "2026-05-23"
---

# Resume incomplete workflow runs by ticket

## Problem

Today `workflow_start` always calls `createWorkflowRun`, which writes a fresh `_status.json` with empty `completed_phases`. There is no lookup for an in-progress run.

When `ticket_slug` is passed in `workflow_start` args, `createRunId` uses it as `run_id`, so runs live at `.saguaro/runs/<ticket_slug>/`. A second `workflow_start` with the same slug **overwrites** prior state instead of resuming.

Orchestrator skills (any host) should be able to re-invoke the same command — e.g. `/eng my-ticket` — and continue dispatch from the last incomplete phase without a separate `/work` skill or manual `run_id` handoff.

## Goal

**`saguaro-workflow` owns run discovery and resume.** Host skills stay thin: call start-or-resume once in setup, then the existing dispatch loop.

## Decision

**Option B selected at promotion** — opaque `run_id`, `.saguaro/runs/` run index keyed by `(workflow_name, ticket_slug)`. RFC to finalize index schema and completed-run behavior.

## Design fork (pick one in implementation RFC)

### Option A — `run_id` = `ticket_slug` (extend current default)

- Keep `createRunId` preferring `ticket_slug` when present.
- Make `workflow_start` **idempotent for incomplete runs**: if `.saguaro/runs/<run_id>/_status.json` exists, `completed_at` is null, and `workflow_name` matches the requested workflow, return the existing run (do not reset state).
- If the run is **complete** (`completed_at` set), either start a new run (new run_id strategy) or return a clear error — document chosen behavior.
- **Collision:** same ticket slug under different workflow names (`engineering-lite` vs `engineering-standard`) shares one run directory today; idempotent start must compare `workflow_name` and refuse or namespace (see Option A2).

**Option A2 — namespaced run_id**

- `run_id = `${workflow_name}/${ticket_slug}`` or hash — avoids lite vs standard collision while staying deterministic.

### Option B — opaque `run_id`, ticket holds the reference

- `workflow_start` always generates a UUID (or timestamped) run_id.
- Persist a **run index** under `.saguaro/runs/` (e.g. scan + `_index.json`, or `by-ticket/<ticket_slug>.json` → `{ run_id, workflow_name, completed_at }`) so Saguaro can find the active run without host-specific ticket layout.
- **Alternatively / additionally:** document that orchestrators may write `saguaro_run_id` into ticket metadata (frontmatter, sidecar file). Saguaro exposes `workflow_resume({ run_id })` or accepts `run_id` on start when provided; lookup by ticket remains an MCP concern, not a path baked into public API.

Option B is preferable if multiple concurrent or sequential runs per ticket slug must be supported (re-run after completion, A/B workflows).

## Proposed MCP surface (sketch — refine in RFC)

At least one of:

| Tool | Behavior |
|------|----------|
| `workflow_start` (extended) | `{ resume: true \| "auto" }` default `auto`: return existing incomplete run for `(workflow_name, ticket_slug)` else create |
| `workflow_find_run` | `{ ticket_slug, workflow_name?, include_completed?: false }` → `{ run_id, status } \| null` |
| `workflow_resume` | `{ ticket_slug, workflow_name? }` → same as find + validate incomplete, else error |

Prefer **one** primary entry point for hosts (`workflow_start` with auto-resume) plus optional `workflow_find_run` for status UIs.

## Acceptance criteria

- [x] RFC in repo docs: Option A vs B (and collision / completed-run policy).
- [x] Re-invoking `workflow_start` with the same `ticket_slug` and workflow **does not wipe** an incomplete run.
- [x] `workflow_dispatch_phase` continues from `pending_phases` / gates on resumed run (existing behavior; add regression test).
- [x] Tests: fresh start, resume after partial phases, resume with pending approval gate, completed run policy, workflow_name mismatch handling.
- [x] Public README / workflow skill updated: no separate resume slash command required on hosts.
- [x] If Option B: run index or documented ticket `saguaro_run_id` contract; index must not assume `engineering/_active/` or any consumer path.

## Non-goals

- No `ticket_path` or client/project queue roots in public MCP (consumers resolve paths).
- No Captain Goose–specific ticket file layout in this repo.
- Replacing `/work` in downstream plugins (they can deprecate once start-or-resume works).

## Implementation notes

- Core: `mcp-servers/core/src/workflow/runtime.ts` (`createRunId`, `createWorkflowRun`, new `findIncompleteRun` / idempotent start).
- MCP: `mcp-servers/saguaro-workflow/src/server.ts` (`workflowStart`, optional find/resume tools).
- Branch: `feature/workflow-resume-existing-run`

## References

- `createRunId` uses `ticket_slug` today: `mcp-servers/core/src/workflow/runtime.ts`
- `workflow_start` always creates: `mcp-servers/saguaro-workflow/src/server.ts`
