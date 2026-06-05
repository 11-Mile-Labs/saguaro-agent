# Intake

## Summary

Add a `workflow_start` path-source option so callers can start a run from a
concrete workflow YAML file without registering it in bundled or project
workflow directories.

## Scope Class

Medium enhancement touching public workflow MCP API, workflow resolution,
run-state persistence, status/log metadata, docs, and focused tests.

## Acceptance Criteria

- `workflow_start` accepts optional `workflow_path` argument.
- Relative `workflow_path` resolves under `project_path`; absolute paths obey existing filesystem policy.
- Referenced YAML uses same schema and semantic validation as bundled/project workflows.
- Run state snapshots exact resolved workflow content so resume is immune to source-file drift.
- `workflow_status` and dispatch/log metadata identify path-sourced runs without `workflow_list` registration.
- Docs explain caller-provided wording may be executed while Saguaro core remains neutral and vocabulary-agnostic.
