---
title: 'Fix docs-writer artifact stubs'
slug: fix-docs-writer-artifact-stubs
type: bug
priority: high
complexity: small
status: promoted
created: '2026-06-14'
updated: '2026-06-14'
---

# Fix docs-writer artifact stubs

## Problem

Saguaro docs phases can pass validation while writing a pointer artifact such as
`Full docs written to .saguaro/runs/.../docs.md` or
`See full artifact at .saguaro/runs/.../docs.md` instead of full multi-section
documentation prose.

This breaks workflow closeout because `workflow_validate_output` can pass on
`docs_summary` / `knowledge_captures` while the actual `<run>/docs.md` body is
not durable documentation.

## Why

A downstream workflow added local materializer guards, but the source behavior
belongs in Saguaro. Downstream consumers should not need local safeguards once
Saguaro prevents or rejects stub docs artifacts at the workflow source.

## Scope

In:

- Make the docs-writer dispatch contract require complete markdown prose.
- Require callers to pass full markdown in `artifact.content` when recording
  docs-writer artifacts.
- Reject complete docs-writer artifacts that are self-referential stubs.
- Reject complete docs-writer artifacts that are too short to be real docs.
- Add regression coverage.

Out:

- Downstream materializer changes.
- Plugin-cache hot patches.
- Rewriting all workflow validation semantics.

## Likely Files

- `mcp-servers/core/src/workflow/envelope.ts`
- `mcp-servers/saguaro-workflow/src/server.ts`
- `mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`

## Acceptance Criteria

- [x] Docs-writer dispatch contract says to write complete multi-section
      documentation prose to the artifact path.
- [x] Dispatch contract says `workflow_record_artifact` must receive
      `artifact.content` containing the full markdown artifact, not a pointer,
      summary, or path.
- [x] `workflow_record_artifact` rejects complete docs-writer artifacts matching
      `See full artifact at` or `Full docs written to`.
- [x] `workflow_record_artifact` rejects complete docs-writer artifacts with
      less than 1024 non-whitespace characters.
- [x] Regression test covers dispatch contract text and both rejection cases.
- [x] `pnpm --filter @11-mile-labs/saguaro-workflow test` passes.
- [x] `pnpm --filter @11-mile-labs/saguaro-workflow typecheck` passes.

## Verification Notes

After this lands, downstream consumers should rerun or smoke a fresh docs phase
and verify `<run>/docs.md` is real prose over 1 KB with no self-reference
before archiving their local docs-artifact quality ticket.

## Notes

- [2026-06-14] Promoted from backlog to engineering pipeline -> `.engineering/_active/fix-docs-writer-artifact-stubs/00-backlog.md`
- [2026-06-14] Implemented docs-writer artifact quality guard and verified workflow package tests/typecheck.
