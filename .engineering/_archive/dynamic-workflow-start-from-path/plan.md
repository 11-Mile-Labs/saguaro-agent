# Plan

## Research Findings

- `workflow_start` currently resolves only by workflow name through `WorkflowService.getWorkflowCatalog()` and `getWorkflowByName()` in `mcp-servers/saguaro-workflow/src/server.ts`.
- Workflow discovery lives in `mcp-servers/core/src/workflow/discovery.ts`; `validateWorkflowYamlFile()` already validates an arbitrary file but currently returns only validation output, not a source entry for starting a run.
- Run state snapshots the selected workflow in `_workflow.json` through `writeRunFiles()`, so path-sourced resume drift can be handled by loading the path workflow once before `createWorkflowRun()` or `startOrResumeWorkflowRun()`.
- `WorkflowSourceEntry.source` is currently limited to `project | bundled`; adding `path` is the smallest public metadata extension for source identity without registering the workflow in `workflow_list`.
- `WorkflowRunStatus` currently stores workflow_name/version/args but no workflow source metadata; status responses and dispatch envelopes can expose source metadata from persisted status/workflow without re-reading source YAML.
- Tests already cover workflow service start/dispatch/resume and discovery precedence; add path-source tests there plus docs in README and workflow resume docs.

## Architecture

Add a core path-source loader beside discovery: resolve a caller-supplied `workflow_path` under `projectRoot` when relative, accept absolute paths as-is under current filesystem permissions, validate through the same `validateWorkflowDefinition` path, and return a `WorkflowSourceEntry` with `source: "path"`, `path`, and workflow. Extend workflow metadata types with optional `workflow_source` on run status and source fields on dispatch envelopes/status responses.

In `WorkflowService.workflowStart`, choose path-source when `workflow_path` is present, otherwise keep existing named catalog lookup. Preserve existing workflow name matching and resume behavior: the selected workflow's own `name` remains the run workflow name and ticket index key. If supplied `name` differs from YAML `name`, fail fast unless we intentionally support aliasing; this keeps resume/index semantics unambiguous.

## Impact

- `mcp-servers/core/src/workflow/discovery.ts`
- `mcp-servers/core/src/workflow/types.ts`
- `mcp-servers/core/src/workflow/runtime.ts`
- `mcp-servers/core/src/workflow/envelope.ts`
- `mcp-servers/saguaro-workflow/src/server.ts`
- `mcp-servers/core/src/__tests__/discovery.test.ts`
- `mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`
- `README.md`
- `docs/workflow-run-resume.md`

## Verification Plan

- Run focused workflow server tests: `pnpm --filter @11-mile-labs/saguaro-workflow test -- --run mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`.
- Run core tests: `pnpm --filter @11-mile-labs/saguaro-core test -- --run mcp-servers/core/src/__tests__/discovery.test.ts mcp-servers/core/src/__tests__/run-index.test.ts`.
- Run package typecheck for touched packages: `pnpm --filter @11-mile-labs/saguaro-core typecheck` and `pnpm --filter @11-mile-labs/saguaro-workflow typecheck`.
- Run repo lint/build if implementation passes focused tests or before commit.

## Implementation Plan

1. Extend `WorkflowSourceEntry.source` to include `path` and add a reusable `loadWorkflowSourceAtPath({ projectRoot, workflowPath, engineVersion })` helper.
2. Add `workflow_source` metadata to `WorkflowRunStatus` and optional source metadata to `WorkflowDispatchEnvelope`. Thread `WorkflowSourceEntry` into run creation/start-or-resume so `_status.json` snapshots source kind/path while `_workflow.json` snapshots workflow content.
3. Update `WorkflowService.workflowStart` signature/tool schema to accept `workflow_path`, resolve/load path source when present, validate `name` equals loaded workflow name, and return `workflow_source`. Keep `workflow_list` unchanged so path-sourced workflows are not registered.
4. Update `workflow_status` and dispatch response envelopes to include `workflow_source` so callers/logs can identify path-sourced runs.
5. Add service tests proving relative path start, no `workflow_list` registration, `_workflow.json` drift immunity on resume after source YAML changes, and status/dispatch source metadata.
6. Document `workflow_path` in README and workflow resume docs, including neutrality note for caller-provided wording.
