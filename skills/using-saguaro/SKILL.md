---
name: using-saguaro
description: "Use when starting substantial work in a Saguaro-enabled project - establishes when to query memory, search knowledge, run workflows, and store durable lessons."
argument-hint: "[task-or-repo-context]"
license: MIT
---

# Using Saguaro

Use this skill when Saguaro is installed, `.saguaro/` exists, or the user asks how Saguaro changes agent work.

For user onboarding, prefer the repository guides:

- `docs/getting-started.md`
- `docs/adopting-saguaro-in-existing-skills.md`

Saguaro provides three capabilities that should work together:

- `saguaro-workflow` runs portable workflow definitions from bundled `workflows/*.yaml` or project-local `.saguaro/workflows/*.yaml`.
- `saguaro-memory` stores and retrieves sentence-to-paragraph lessons, decisions, gotchas, and observations across run, project, and global scopes.
- `saguaro-knowledge` stores and retrieves document-scale specs, notes, plans, references, and decision records.

## Instruction Priority

User instructions and project `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` files remain the highest authority. Saguaro tells you how to preserve context and run workflows; it does not override explicit user scope, security, privacy, or review instructions.

## Default Behavior

Apply the 1% rule: if there is even a small chance prior memory or knowledge could affect the task, query it before starting fresh work.

For non-trivial work, call `memory_retrieve`, then `knowledge_search` or `knowledge_query` when docs, specs, prior plans, or references might exist. Use the results to choose whether to run a workflow, answer directly, or ask for missing input. Store durable findings with `memory_store` as they appear, and ingest durable artifacts with `knowledge_ingest`.

## Decision Flow

For each substantial user request:

1. Check whether Saguaro is available: look for `.saguaro/config.yaml`, Saguaro MCP tools, or Saguaro skills.
2. If Saguaro is available and the request depends on repo history, prior decisions, plans, tickets, docs, debugging context, or reusable lessons, query memory and knowledge first.
3. If the work fits a registered workflow, use `workflow_list` and the `workflow` skill rather than inventing a one-off process.
4. If no workflow fits, continue normally but keep using memory and knowledge.
5. When the task creates durable knowledge, store or ingest it before finalizing.

## Red Flags

These thoughts usually mean you are about to bypass Saguaro incorrectly:

- "I will just inspect the repo first." Query memory/knowledge first when prior context could matter.
- "This is only a quick fix." Quick fixes still repeat old mistakes when context is missing.
- "I remember the decision." Retrieve the current memory or knowledge entry instead of trusting recollection.
- "The workflow is probably too heavy." Check `workflow_list`; use a workflow when one matches the work.
- "I will store the lesson at the end." Store durable findings when they appear, while the evidence is fresh.

## Choosing The Surface

Use `memory_*` for concise lessons, decisions, gotchas, and outcomes.

Use `knowledge_*` for documents, specs, plans, references, and longer artifacts.

Use `workflow_*` for phased work with artifacts, validation, gates, or promotion candidates.

Saguaro redacts common secret shapes before memory or knowledge content is written locally or embedded. Redaction is config-driven and can be disabled or narrowed when a rule breaks legitimate content. Do not intentionally store secrets; redaction is a guardrail, not permission to preserve sensitive values.

## Workflow Use

Use `workflow_list` to see available workflows. Project-local workflows shadow bundled workflows with the same `name`.

Use the bundled `workflow` skill when the user asks to run work through Saguaro:

```text
/workflow run engineering --ticket my-ticket
```

During a workflow run, `workflow_start` creates or resumes `.saguaro/runs/<run-id>/` (opaque id; ticket lookup uses `.saguaro/runs/_by-ticket/`). Re-invoking with the same `ticket_slug` and workflow returns an incomplete run instead of wiping state. `workflow_dispatch_phase` returns envelopes, the host harness executes them, `workflow_validate_output` checks outputs and required Saguaro calls, `workflow_record_artifact` stores artifacts, and `workflow_complete` finalizes the run.

If validation says a phase skipped required memory or knowledge, query the missing surface and re-dispatch the phase with the validation feedback.

## Tool Naming

Use the public Saguaro names only:

- `workflow_*`
- `memory_*`
- `knowledge_*`

## Configuration Rules

Saguaro reads project-local `.saguaro/config.yaml` and process env vars passed by the host MCP configuration. Do not read secrets or config from user-home shell profiles or machine-local env files.

## When To Store Memory

Call `memory_store` for non-obvious root causes, decisions and rationale, reusable gotchas, API or tool behavior, and verification outcomes that would save a future run time.

Prefer one durable idea per memory. Use `run` scope first when the finding may be temporary; promote to `project` or `global` when it proves durable.

## When To Ingest Knowledge

Call `knowledge_ingest` for future-reference artifacts: architecture plans, research briefs, decision records, workflow guidance, specs, acceptance criteria, and migration notes.

Knowledge is document-scale. Memory is lesson-scale.
