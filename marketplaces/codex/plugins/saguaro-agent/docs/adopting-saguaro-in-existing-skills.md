# Adopting Saguaro In Existing Skills

This guide explains how to update an existing agent skill so it benefits from Saguaro without becoming tied to one harness, model provider, or private workflow.

The goal is not to rewrite your skill. The goal is to add durable context habits around the work the skill already does.

For user-facing invocation examples and bundled skill explanations, see [skills-and-agents.md](./skills-and-agents.md).

## Adoption Pattern

Add three small sections to the skill:

1. **Preflight:** retrieve relevant memory and knowledge before starting.
2. **Execution:** use a Saguaro workflow when the task is phased or needs validation.
3. **Closeout:** store durable lessons and ingest durable artifacts.

## Before

```markdown
# Bugfix

Use this skill when the user asks you to fix a bug.

1. Reproduce the issue.
2. Identify the root cause.
3. Implement the fix.
4. Run tests.
5. Summarize the result.
```

This can work, but it relies on whatever context the current harness session already has.

## After

````markdown
# Bugfix

Use this skill when the user asks you to fix a bug.

## Saguaro Preflight

If Saguaro is available, apply the 1% rule before starting:

1. Call `memory_retrieve` for similar failures, root causes, test gotchas, and prior decisions.
2. Call `knowledge_search` or `knowledge_query` when project docs, specs, plans, or runbooks may contain relevant context.
3. Use retrieved context to refine the reproduction plan.

## Workflow

For non-trivial bugs, run the bundled `bugfix` workflow:

```text
/workflow run bugfix --ticket <ticket-slug>
```

For tiny fixes, continue directly but keep using `memory_*` and `knowledge_*` when context may matter.

## Closeout

Before finalizing:

1. Call `memory_store` for the root cause, fix pattern, test lesson, or verification outcome if it would save a future run time.
2. Call `knowledge_ingest` for durable artifacts such as root-cause notes, runbooks, decision records, or debugging guides.
3. Report which Saguaro surfaces were used.
````

## The 1% Rule

If there is even a small chance prior context could affect the work, query Saguaro before starting fresh.

Use:

- `memory_retrieve` for concise lessons, decisions, gotchas, and outcomes
- `knowledge_search` when you need to discover relevant documents
- `knowledge_query` when you need an answer synthesized from indexed knowledge

Do not wait until the end of the task to discover that the project already had a relevant decision or lesson.

## Choosing The Right Saguaro Surface

| Need | Use |
| --- | --- |
| A repeated process with phases, gates, artifacts, or validation | `workflow_*` |
| A short durable lesson, gotcha, decision, or outcome | `memory_*` |
| A document, spec, plan, research brief, runbook, or reference | `knowledge_*` |

## Skill Migration Checklist

- Keep the original skill purpose intact.
- Add a Saguaro availability check.
- Add the 1% rule before the main workflow.
- Specify when to call `memory_retrieve`.
- Specify when to call `knowledge_search` or `knowledge_query`.
- Use `workflow_*` only when the work benefits from phased execution.
- Add closeout instructions for `memory_store` and `knowledge_ingest`.
- Never store secrets in memory, knowledge, or `.saguaro/config.yaml`.
- Do not hardcode private provider URLs, local machine paths, or harness-specific assumptions.
- Use public tool families only: `workflow_*`, `memory_*`, and `knowledge_*`.

## Harness-Neutral Language

Prefer this:

```markdown
If Saguaro is available, call `memory_retrieve` before planning the work.
```

Avoid this:

```markdown
Read my shell profile, load my local model server settings, then call this machine-specific MCP.
```

Skills should describe behavior and public tool names. Harness manifests and project config handle runtime wiring.

## When Not To Use A Workflow

Do not force every skill through a Saguaro workflow. Direct use of `memory_*` and `knowledge_*` is enough when:

- the user asked a narrow question
- the change is tiny and obvious
- the task is exploratory and no workflow fits
- a workflow would add ceremony without improving quality

Even then, the 1% rule still applies.

## What Good Closeout Looks Like

A Saguaro-aware final answer should be able to say:

```text
I checked project memory for prior failures, queried the deployment runbook from knowledge, ran the bugfix workflow, stored the root-cause lesson, and ingested the updated runbook.
```

That sentence matters because it tells the next agent where durable context went.
