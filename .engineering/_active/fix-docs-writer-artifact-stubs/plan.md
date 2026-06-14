# Plan

## Research Findings

`mcp-servers/core/src/workflow/envelope.ts` builds a generic
`dispatch_contract` for every phase. It currently tells agents to write the
final artifact and call `workflow_record_artifact`, but for docs-writer phases
it does not explicitly require full multi-section markdown in
`artifact.content`.

`mcp-servers/saguaro-workflow/src/server.ts` `workflowRecordArtifact`
normalizes string/object payloads, chooses md/json format, and writes
`payload.content` verbatim with no content-quality guard.

Existing workflow service tests in
`mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts` cover
start/dispatch/record/resume but do not cover docs-writer contract text or
rejecting stub docs artifacts.

## Architecture

Keep workflow schema unchanged. Add behavior at runtime boundaries:

- Envelope generation detects `phase.agent.toLowerCase() === "docs-writer"`
  and appends docs-specific instructions to `dispatch_contract`: produce
  complete multi-section markdown prose and pass the full markdown as
  `artifact.content` to `workflow_record_artifact`, not a pointer/summary/path.
- Server-side validation in `workflowRecordArtifact` handles complete
  docs-writer artifacts by loading the run phase, checking phase agent,
  artifact status, resolved markdown content, self-referential stub phrases,
  and non-whitespace length.
- Validation throws clear errors before writing the artifact or advancing run
  state.

## Impact

Affected areas:

- `mcp-servers/core/src/workflow/envelope.ts`: dispatch contract generation for
  docs-writer phases.
- `mcp-servers/saguaro-workflow/src/server.ts`: `workflowRecordArtifact`
  validation before file writes/state advancement.
- `mcp-servers/saguaro-workflow/src/__tests__/tools.test.ts`: regression
  coverage for docs-writer dispatch contract text and artifact rejection cases.

Risk is low/medium: runtime behavior changes only for complete docs-writer
artifacts; non-doc phases and partial/failed artifacts should remain unchanged.

## Verification Plan

- Targeted tests: `pnpm --filter @11-mile-labs/saguaro-workflow test`.
- Typecheck: `pnpm --filter @11-mile-labs/saguaro-workflow typecheck`.
- Manual smoke if needed: start an engineering-standard run, dispatch docs
  phase, verify docs-writer contract text mentions full markdown
  `artifact.content`.
- Privacy check: ensure no downstream/private project names appear in tests,
  docs, or error text.

## Implementation Plan

1. Add constants/helper in `envelope.ts` for docs-writer detection and docs
   artifact instructions. Preserve generic phase behavior for all other agents.
2. Update `dispatchContractForPhase` to include docs-writer instructions
   requiring full multi-section markdown prose at `artifact_path` and full
   markdown `artifact.content` in `workflow_record_artifact`.
3. In `server.ts`, add docs-writer artifact guard called after payload
   normalization and before `writeFileSync` / `recordPhaseArtifact`. It should
   skip non-complete statuses, skip non-docs-writer phases, reject phrases
   `See full artifact at` and `Full docs written to`, and reject content with
   fewer than 1024 non-whitespace chars.
4. Ensure the guard uses the loaded workflow phase
   (`getWorkflowPhase(run.workflow, args.phase_id)`) rather than trusting client
   metadata.
5. Add tests: one dispatch test asserting docs-writer envelope contract includes
   full markdown / `artifact.content` wording; one record test rejecting
   self-referential pointer stub; one record test rejecting undersized complete
   docs-writer artifact. Include a positive control if needed to show a long
   docs artifact records.
6. Run `pnpm --filter @11-mile-labs/saguaro-workflow test` and
   `pnpm --filter @11-mile-labs/saguaro-workflow typecheck`.
