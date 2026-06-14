# Implementation

## Summary

Added docs-writer-specific dispatch instructions requiring complete
multi-section markdown prose and full markdown in `artifact.content`.

Added server-side validation for complete docs-writer artifacts before file
writes/state advancement:

- Rejects pointer phrases such as `See full artifact at` and
  `Full docs written to`.
- Rejects complete docs-writer artifacts under 1024 non-whitespace characters.
- Leaves non-docs-writer phases and non-complete docs-writer artifacts outside
  this guard.

Added regression tests for dispatch contract wording, pointer rejection,
undersized rejection, and successful full docs recording.

## Files Changed

- `mcp-servers/core/src/workflow/envelope.ts`
- `mcp-servers/saguaro-workflow/src/server.ts`
- `mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`

## Verification

- `pnpm --filter @11-mile-labs/saguaro-workflow test` passed: 3 files, 12 tests.
- `pnpm --filter @11-mile-labs/saguaro-workflow typecheck` passed.
