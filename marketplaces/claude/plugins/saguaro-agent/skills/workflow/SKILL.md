---
name: workflow
description: "Run a named Saguaro workflow through the bundled workflow MCP."
argument-hint: "[run <workflow-name> [--ticket <ticket-slug>] [--arg key=value]]"
license: MIT
---

# Workflow

Use this skill for `/workflow run <workflow-name>`.

## Setup

1. Parse the workflow name plus any `--ticket` or repeated `--arg key=value` pairs from the user request.
2. Call `workflow_runtime_info()` once so you know the active harness and whether LLM and embeddings are configured.
3. Call `workflow_start(name, args)` with the parsed workflow name and args object. Include `ticket_slug` when the host has a stable ticket identifier so Saguaro can auto-resume incomplete runs on re-invocation.

## Loop

Repeat until the workflow is complete.

1. Call `workflow_dispatch_phase(run_id)`.
2. If the result is `{done: true}`, stop the loop and continue to Finalize.
3. If the result is `{blocked: true}`, surface the blocking gate or clarification request to the user and pause.
4. Otherwise read the returned envelopes and their dispatch contracts.
5. If an envelope has `phase_id: "plan"`, treat it as a composite planning phase:
   - Pass all upstream intake context into the phase executor.
   - Require the final artifact to include `## Research Findings`, `## Architecture`, `## Impact`, `## Verification Plan`, and `## Implementation Plan`.
   - Require `specialist_escalations` when the plan identifies frontend, data, security, or performance risk; empty or omitted escalations mean the DA phase must challenge whether no specialist review is correct.
   - See `docs/composite-planning-phase.md` for the required section contract.
6. Use your harness-native subagent or parallel-agent capability to execute the envelope instructions.
7. After each phase result returns, call `workflow_validate_output(run_id, phase_id, output_envelope)`.
8. If validation fails because required outputs or memory/knowledge calls are missing, re-dispatch that phase with the validation feedback.
9. Record the artifact with `workflow_record_artifact(run_id, phase_id, artifact)`.

## Finalize

1. Call `workflow_complete(run_id)` after the loop ends cleanly.
2. Surface promotion candidates, approval results, and the artifact summary to the user.
3. If the workflow changed code or docs, run the repo's normal verification commands before claiming success.

## Notes

- Prefer bundled workflows from `workflow_list()` unless the project already defines a local override in `.saguaro/workflows/`.
- Treat `plan` as a first-class composite phase, not a generic placeholder.
- Keep tool calls inside the public Saguaro surface: `workflow_*`, `memory_*`, and `knowledge_*`.
