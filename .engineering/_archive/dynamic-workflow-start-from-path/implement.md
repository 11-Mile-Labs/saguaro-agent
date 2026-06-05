# Implementation

## Summary

Implemented `workflow_start.workflow_path` for starting runs from concrete workflow
YAML files outside the workflow catalog.

Resume now returns an existing explicit or ticket-indexed run before re-reading
the source path, so deleted or invalid changed source files do not break in-flight
runs that already snapshotted `_workflow.json`.

## Files Changed

- `mcp-servers/core/src/workflow/discovery.ts`
- `mcp-servers/core/src/workflow/types.ts`
- `mcp-servers/core/src/workflow/runtime.ts`
- `mcp-servers/core/src/workflow/envelope.ts`
- `mcp-servers/saguaro-workflow/src/server.ts`
- `mcp-servers/core/src/__tests__/discovery.test.ts`
- `mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`
- `README.md`
- `docs/workflow-run-resume.md`
- generated workflow server marketplace artifacts

## Verification

- `pnpm --filter @11-mile-labs/saguaro-core typecheck`
- `pnpm --filter @11-mile-labs/saguaro-workflow typecheck`
- `pnpm exec vitest run src/__tests__/discovery.test.ts src/__tests__/run-index.test.ts` from `mcp-servers/core`
- `pnpm exec vitest run src/__tests__/tools.test.ts` from `mcp-servers/saguaro-workflow`
- `pnpm lint`
- `pnpm build`

## Note

One earlier `pnpm --filter @11-mile-labs/saguaro-core test -- --run ...` command
used the wrong Vitest argument shape and ran the whole core package. It failed on
an unrelated storage backend default expectation (`chromadb` vs `filesystem`).
The exact touched core tests passed when run directly from `mcp-servers/core`.
