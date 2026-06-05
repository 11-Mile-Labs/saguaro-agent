# Saguaro

Durable workflow, memory, and knowledge foundations for AI coding harnesses.

Saguaro is an open-source project from 11 Mile Labs for developers who want their AI coding agents to stop starting from scratch. Install it once at user scope, initialize it in any existing project, and your agents can retrieve prior decisions, search durable project knowledge, run structured workflows, and store lessons for the next session.

It works across Claude Code, Codex, and Gemini CLI through one public plugin surface:

- `saguaro-workflow`
- `saguaro-memory`
- `saguaro-knowledge`

Saguaro is provider-neutral. It expects OpenAI-compatible embeddings and chat endpoints, but it does not require a specific hosted service, local model server, vector database, or harness.

## Start Here

### I Want To Use Saguaro In My Projects

Install Saguaro into all detected harnesses at user scope:

```bash
./install.sh --dry-run
./install.sh
```

The installer also links a user-level `saguaro` CLI into `~/.local/bin` by default. Then move into an existing project and initialize Saguaro:

```bash
export EMBEDDINGS_BASE_URL="http://localhost:1234/v1"
export EMBEDDINGS_MODEL="text-embedding-bge-m3"
export EMBEDDINGS_API_KEY=""
export LLM_BASE_URL="http://localhost:1234/v1"
export LLM_MODEL="local-chat"
export LLM_API_KEY=""

saguaro init
saguaro doctor
saguaro smoke
```

After that, ask your agent to use Saguaro:

```text
Use Saguaro. Check memory and knowledge first, then run the engineering workflow for this change.
```

Or run a workflow directly from a Saguaro-enabled harness:

```text
/workflow run engineering-lite --ticket improve-empty-state
```

Full walkthrough: [docs/getting-started.md](./docs/getting-started.md).

### I Want To Update My Existing Skills

You do not need to rewrite your skills. Add a Saguaro preflight and closeout:

- Before meaningful work, call `memory_retrieve`.
- Before answering from docs, specs, decisions, or research, call `knowledge_search` or `knowledge_query`.
- For phased engineering work, use `workflow_*`.
- When the work produces a durable lesson, call `memory_store`.
- When the work produces durable docs, plans, specs, or references, call `knowledge_ingest`.

Migration guide: [docs/adopting-saguaro-in-existing-skills.md](./docs/adopting-saguaro-in-existing-skills.md).

### I Want To Create A Custom Workflow

Project-local workflows live in `.saguaro/workflows/*.yaml`. They can extend or shadow the bundled library without changing plugin files.

Ask a Saguaro-enabled agent to guide the process:

```text
/create-workflow release-readiness
```

The `create-workflow` skill asks for the process goal, phases, required inputs and outputs, approval gates, and memory or knowledge requirements, then validates the YAML against the public schema when Saguaro workflow tools are available.

See:

- [docs/workflow-authoring.md](./docs/workflow-authoring.md)
- [docs/workflow-yaml-schema.md](./docs/workflow-yaml-schema.md)
- [docs/config-and-env.md](./docs/config-and-env.md)

### I Want To Develop Saguaro Itself

For local repository development:

```bash
pnpm install
pnpm build
pnpm saguaro init
pnpm doctor
pnpm smoke:local
```

Generated install artifacts live under `marketplaces/`. They include built MCP server bundles, so installation does not require `pnpm install` inside the harness plugin cache.

## Origins

Saguaro grew out of a practical need: coding agents become more useful when workflow state, durable memory, and project knowledge are treated as one system instead of three disconnected habits. The project is shaped by real development work, curiosity about better agent collaboration, and the repeated friction of losing context between tools.

Those origins inform the public product, but the public surface is intentionally generic. Private projects, client work, internal systems, and machine-local setup details do not belong in this repository unless they are explicitly documented as public examples.

## When To Use Saguaro

The rule is simple: if you are not sure whether to query memory or knowledge, query it.

Memory and knowledge lookups are cheap. Missing relevant context is expensive. If there is even a 1% chance that a prior lesson, decision, spec, or reference might matter, the agent should call `memory_*` or `knowledge_*` before starting fresh work. That 1% rule is part of the product contract, not a soft suggestion.

## What Ships In V1

Saguaro publishes one plugin surface with three MCP servers:

| Server | Purpose | Public tool family |
| --- | --- | --- |
| `saguaro-workflow` | Workflow orchestration, run state, validation, artifacts, and lifecycle | `workflow_*` |
| `saguaro-memory` | Durable lessons and observations at run, project, and global scope | `memory_*` |
| `saguaro-knowledge` | Durable document-scale knowledge for retrieval and synthesis | `knowledge_*` |

Memory and knowledge use project-local vector manifests for semantic retrieval. Content is redacted before it is written locally or embedded. `knowledge_query` retrieves ranked chunks and can synthesize answers through any OpenAI-compatible chat completions endpoint.

## Tool Surface

### Workflow

| Tool | Description |
| --- | --- |
| `workflow_list` | List bundled and project-local workflows available to run. |
| `workflow_start` | Start or resume a workflow run by catalog name or explicit `workflow_path`; with `ticket_slug` and default `resume: auto`, returns an existing incomplete run instead of resetting state. |
| `workflow_find_run` | Find a run indexed by `ticket_slug` and `workflow_name`. |
| `workflow_resume` | Resume an incomplete run for a ticket or error if none exists. |
| `workflow_status` | Report current workflow progress, gates, and validation state. |
| `workflow_dispatch_phase` | Dispatch the next eligible phase or a specific phase. |
| `workflow_validate_dispatch` | Validate the dispatch envelope before a phase runs. |
| `workflow_validate_output` | Enforce required outputs and required Saguaro tool calls. |
| `workflow_record_artifact` | Persist a phase artifact into the current run directory. |
| `workflow_phase_bundle` | Resolve the context, defaults, and inputs for one phase. |
| `workflow_lessons` | Surface memory retrieval results relevant to the current phase. |
| `workflow_complete` | Finalize a run and return promotion candidates. |
| `workflow_runtime_info` | Report harness, model, and backend readiness. |
| `workflow_validate_yaml` | Validate a workflow file against the public schema. |

`workflow_start` may receive `workflow_path` for a concrete YAML file that is not
registered in `workflow_list`. Relative paths resolve under `project_path`; absolute
paths are read directly subject to the host filesystem policy. The YAML `name`
must match the requested `name`. Saguaro validates and snapshots the workflow into
the run directory, so resume uses the persisted definition even if the source file
later changes. Caller-provided phase prose may contain host-specific wording, but
Saguaro core stays vocabulary-neutral.

### Memory

The 1% rule applies hardest here: if there is even a small chance the agent has seen something similar before, call memory first.

| Tool | Description |
| --- | --- |
| `memory_store` | Store one durable lesson, observation, or outcome. |
| `memory_retrieve` | Search memory before fresh work when prior context might exist. |
| `memory_pin` | Mark a memory as especially durable or high-signal. |
| `memory_unpin` | Remove a pin without deleting the underlying memory. |
| `memory_promote` | Move memory from a narrower scope to a broader one. |
| `memory_list` | Enumerate stored memories by scope and filter. |
| `memory_status` | Summarize counts and freshness by scope. |
| `memory_delete` | Remove a stored memory entry. |

### Knowledge

If there is even a 1% chance the answer already lives in specs, notes, or prior research, query knowledge before inventing a new answer.

| Tool | Description |
| --- | --- |
| `knowledge_ingest` | Add a document or artifact to the durable knowledge corpus. |
| `knowledge_query` | Retrieve ranked chunks for synthesis against a prompt. |
| `knowledge_search` | Discover relevant documents when topic or title is uncertain. |
| `knowledge_list` | Enumerate indexed knowledge documents. |
| `knowledge_get` | Fetch a full knowledge document by identifier. |
| `knowledge_update` | Replace content or tags for an indexed document. |
| `knowledge_delete` | Remove a document from the knowledge corpus. |

## Configuration

Saguaro is project-local by design.

- Config lives at `.saguaro/config.yaml`.
- This file is Saguaro's project YAML surface; it is not named `project.yaml` in v1.
- Secrets stay out of YAML.
- MCP manifests pass secret names as environment variables.
- Saguaro does not read user-home shell files or machine-local env files.

See [docs/config-and-env.md](./docs/config-and-env.md) for the canonical config reference.

## Workflow Model

Workflows live in `.saguaro/workflows/*.yaml` for project-local definitions and `workflows/*.yaml` for bundled definitions. User workflows shadow bundled workflows on name collision. Phase contracts can require memory or knowledge calls, and Saguaro validates those requirements against its own dispatch log.

See:

- [docs/workflow-yaml-schema.md](./docs/workflow-yaml-schema.md)
- [docs/dispatch-logging.md](./docs/dispatch-logging.md)
- [docs/1-percent-rule.md](./docs/1-percent-rule.md)

## Memory And Knowledge Scopes

| Scope | Memory | Knowledge | Notes |
| --- | --- | --- | --- |
| `run` | Yes | No | Fast, local lessons captured during an active workflow run. |
| `project` | Yes | Yes | The default long-lived scope for one codebase. |
| `global` | Yes | Yes | Cross-project patterns and references. |

See [docs/memory-vs-knowledge.md](./docs/memory-vs-knowledge.md).

## Model Tiers

Saguaro resolves logical tiers such as `standard`, `deep`, and `surgeon` through per-harness mappings in `.saguaro/config.yaml`. The workflow file stays portable; the harness-specific model choice stays local.

See [docs/model-tiers.md](./docs/model-tiers.md).

## Repository Layout

```text
saguaro-agent/
├── docs/
├── examples/
├── marketplaces/
│   ├── claude/
│   ├── codex/
│   └── gemini/
├── mcp-servers/
│   ├── core/
│   ├── saguaro-workflow/
│   ├── saguaro-memory/
│   └── saguaro-knowledge/
├── skills/
│   ├── create-workflow/
│   ├── using-saguaro/
│   ├── workflow/
│   └── saguaro/
└── workflows/
```

## Bundled Skills

| Skill | Purpose |
| --- | --- |
| [`create-workflow`](./skills/create-workflow/SKILL.md) | Guides users through drafting and validating a new project-local workflow YAML. |
| [`using-saguaro`](./skills/using-saguaro/SKILL.md) | Teaches agents what Saguaro offers and when to use workflow, memory, and knowledge. |
| [`workflow`](./skills/workflow/SKILL.md) | Runs a named Saguaro workflow through the workflow MCP. |
| [`saguaro`](./skills/saguaro/SKILL.md) | Initializes project-local `.saguaro/` config and workflow directories. |

## Documentation

- [docs/1-percent-rule.md](./docs/1-percent-rule.md)
- [docs/adopting-saguaro-in-existing-skills.md](./docs/adopting-saguaro-in-existing-skills.md)
- [docs/config-and-env.md](./docs/config-and-env.md)
- [docs/dispatch-logging.md](./docs/dispatch-logging.md)
- [docs/getting-started.md](./docs/getting-started.md)
- [docs/memory-vs-knowledge.md](./docs/memory-vs-knowledge.md)
- [docs/model-tiers.md](./docs/model-tiers.md)
- [docs/plugin-installation.md](./docs/plugin-installation.md)
- [docs/product-dx.md](./docs/product-dx.md)
- [docs/semver-and-compatibility.md](./docs/semver-and-compatibility.md)
- [docs/skills-and-agents.md](./docs/skills-and-agents.md)
- [docs/workflow-authoring.md](./docs/workflow-authoring.md)
- [docs/workflow-yaml-schema.md](./docs/workflow-yaml-schema.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
