# Product And Developer Experience

This document defines the public onboarding promise for Saguaro. It exists so installation, documentation, examples, and skill guidance stay aligned around the same end-user journey.

## Press Release First

Saguaro gives AI coding agents a shared memory, durable knowledge base, and repeatable workflow system that works across Claude Code, Codex, and Gemini CLI.

Install it once at user scope, initialize it in any existing project, and your agents can stop starting from scratch. They can retrieve prior decisions, search project knowledge, run structured workflows, and store lessons for the next session without locking you into one model provider, one local stack, or one harness.

## One-Liner

Saguaro helps AI coding agents carry context across sessions and harnesses without forcing a specific model provider or project structure.

## Primary Users

| User | Job |
| --- | --- |
| Solo developer using multiple AI harnesses | Install once, initialize existing projects, and keep agents from losing hard-won context. |
| Team lead standardizing agent workflows | Publish repeatable workflows and memory/knowledge habits across projects. |
| Skill author | Add durable memory, knowledge, and workflow behavior to existing skills without rewriting them. |
| Plugin maintainer | Build and validate harness-specific install artifacts from one source tree. |

## Core Journey

1. A developer lands on the repo and understands the promise in under one minute.
2. They install Saguaro at user scope for the harnesses they already use and get a user-level `saguaro` CLI.
3. They initialize one existing project with `saguaro init`.
4. They verify the backend with `saguaro doctor` and `saguaro smoke`.
5. They ask their agent to use Saguaro for a real task.
6. The agent retrieves memory, searches or queries knowledge, and runs a workflow when appropriate.
7. The agent stores durable lessons and ingests durable artifacts before closeout.
8. Future sessions benefit from that context.

## First Successful Session

A first successful session should prove four things:

- The harness exposes Saguaro MCP tools.
- `.saguaro/config.yaml` exists in the target project.
- `memory_store` and `memory_retrieve` work.
- `knowledge_ingest`, `knowledge_search`, and `knowledge_query` work.

Workflow execution is the next step, not the only proof of value. Memory and knowledge should be useful even when no workflow fits.

## DX Principles

- **User-scope by default:** Developers should not install the plugin separately for every project.
- **CLI available outside the repo:** The installer should expose `saguaro init`, `saguaro doctor`, and `saguaro smoke` from a user bin directory.
- **Project-local state:** Project config, run state, local workflows, memory, and knowledge belong under `.saguaro/`.
- **Provider-neutral wiring:** Saguaro should work with any OpenAI-compatible embeddings and chat provider.
- **No secret storage:** Config names env vars; it does not store secret values.
- **Skill adoption over skill replacement:** Existing skills should add Saguaro preflight and closeout behavior before considering a rewrite.
- **Workflows when useful:** Workflows are for phased work, gates, artifacts, and validation. Direct memory and knowledge calls remain first-class.
- **Public names only:** The public tool families are `workflow_*`, `memory_*`, and `knowledge_*`.

## Non-Goals

- Saguaro does not require one specific model provider.
- Saguaro does not require one specific vector database.
- Saguaro does not read user-home shell profiles or machine-local env files.
- Saguaro does not make every task a workflow.
- Saguaro does not replace project instructions such as `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`.
- Saguaro does not store secrets in repository config files.

## Documentation Jobs

| Document | Job |
| --- | --- |
| `README.md` | Explain the promise, route users to the right first action, and define the public surface. |
| `docs/getting-started.md` | Walk a new user from install through first existing project verification. |
| `docs/plugin-installation.md` | Explain marketplace artifacts, build behavior, and harness-specific install commands. |
| `docs/adopting-saguaro-in-existing-skills.md` | Show skill authors how to add Saguaro without rewriting everything. |
| `docs/config-and-env.md` | Define project config and environment variable mapping. |
| `docs/product/prds/` | Capture feature requirements before implementation work starts. |
| `examples/` | Provide small projects that demonstrate realistic first workflow use. |

## Success Criteria

An onboarding pass is good when a new user can answer:

- What problem does Saguaro solve?
- Do I install it once or per project?
- What do I run in my first existing project?
- Which env vars do I need?
- How do I know memory and knowledge actually work?
- How do I make an existing skill Saguaro-aware?
- Where do project state and secrets live?

If those answers require reading source code, the onboarding is not done.
