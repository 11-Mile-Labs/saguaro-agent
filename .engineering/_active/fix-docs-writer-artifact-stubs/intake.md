# Intake

## Summary

Prevent Saguaro docs-writer phases from accepting or recording pointer-only
documentation artifacts. The source workflow contract and artifact recording
path should require full multi-section markdown prose and reject
self-referential or undersized docs artifacts before workflow closeout can pass.

## Scope Class

Small high-priority bugfix touching the workflow dispatch contract, workflow
artifact recording validation, and regression tests in the Saguaro workflow
package. Expected files: `mcp-servers/core/src/workflow/envelope.ts`,
`mcp-servers/saguaro-workflow/src/server.ts`, and
`mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`.

## Acceptance Criteria

- Docs-writer dispatch contract instructs agents to write complete
  multi-section documentation prose to the artifact path.
- Docs-writer dispatch contract states `workflow_record_artifact` must receive
  `artifact.content` with the full markdown artifact, not a pointer, summary,
  or path.
- `workflow_record_artifact` rejects complete docs-writer artifacts containing
  self-referential stubs such as `See full artifact at` or
  `Full docs written to`.
- `workflow_record_artifact` rejects complete docs-writer artifacts with fewer
  than 1024 non-whitespace characters.
- Regression tests cover dispatch contract wording and both rejection cases.
- `pnpm --filter @11-mile-labs/saguaro-workflow test` passes.
- `pnpm --filter @11-mile-labs/saguaro-workflow typecheck` passes.
