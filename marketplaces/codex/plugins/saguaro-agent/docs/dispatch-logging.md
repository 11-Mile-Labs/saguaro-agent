# Dispatch Logging

Saguaro validates workflow behavior against its own MCP activity log.

## Log Location

Each workflow run writes an append-only log at:

```text
.saguaro/runs/<run-id>/_dispatch.jsonl
```

## What Gets Logged

Each Saguaro MCP server appends one JSON object per tool call. A representative entry looks like this:

```json
{
  "ts": "2026-05-19T14:30:22.341Z",
  "run_id": "fix-login-bug",
  "phase_id": "research",
  "server": "saguaro-memory",
  "tool": "memory_retrieve",
  "args_hash": "sha256:...",
  "duration_ms": 142,
  "ok": true
}
```

## Why It Exists

Dispatch logging gives Saguaro a durable, harness-neutral way to answer questions like:

- Did this phase produce every required output?
- Did the phase call `memory_retrieve` when the contract required it?
- Did the phase query knowledge before producing research output?

## Coverage

Covered:

- `workflow_*` calls
- `memory_*` calls
- `knowledge_*` calls

Not covered:

- non-Saguaro tools such as shell, file read, or web tools

That limitation is acceptable for v1 because workflow contract enforcement is defined only in terms of the Saguaro public tool surface.

## Lifecycle

- Created when a workflow run starts
- Updated throughout the run
- Retained with the rest of the run state after completion
- Expected to be gitignored by default unless a project chooses to audit-log it
