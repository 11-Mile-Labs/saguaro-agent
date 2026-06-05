# Getting Started

This guide is for developers who want to use Saguaro in an existing project.

Saguaro installs once at user scope for Claude Code, Codex, and Gemini CLI. Each project that wants Saguaro gets its own `.saguaro/config.yaml`, run state, workflow overrides, memory, and knowledge data.

If you remember one thing, make it this: Saguaro gives agents a durable operating loop. They check what the project already knows, run the right workflow, record what happened, and leave the next session better prepared.

## What You Get

After setup, your agent can:

- run repeatable workflows with `workflow_*`
- retrieve and store durable lessons with `memory_*`
- ingest and query project knowledge with `knowledge_*`
- keep project configuration local to `.saguaro/config.yaml`
- use any OpenAI-compatible embeddings or chat provider you configure

## The Five-Minute Path

Use this path when you want the shortest possible first success:

```bash
./install.sh --dry-run
./install.sh

export EMBEDDINGS_BASE_URL="http://localhost:1234/v1"
export EMBEDDINGS_MODEL="text-embedding-bge-m3"
export EMBEDDINGS_API_KEY=""
export LLM_BASE_URL="http://localhost:1234/v1"
export LLM_MODEL="local-chat"
export LLM_API_KEY=""

cd path/to/your-project
saguaro init
saguaro doctor
```

Then ask your harness:

```text
Use Saguaro. Check memory and knowledge first. Run the engineering-lite workflow for ticket improve-empty-state.
```

For the first run, choose `engineering-lite` unless you already know the change needs product discovery, architecture review, a security audit, or a deep migration plan.

## 1. Install The Plugin

From the Saguaro repository:

```bash
./install.sh --dry-run
./install.sh
```

The installer builds the bundled MCP servers, validates the plugin artifacts, then installs Saguaro into each detected harness at user scope.

It also links the `saguaro` CLI into `~/.local/bin` by default so you can initialize projects from any directory. If that directory is not on your `PATH`, the installer prints a note.

To install only one harness:

```bash
./install.sh --claude
./install.sh --codex
./install.sh --gemini
```

To skip the CLI link or choose a different bin directory:

```bash
./install.sh --no-cli
./install.sh --cli-dir "$HOME/bin"
```

Manual harness commands are documented in [plugin-installation.md](./plugin-installation.md).

## 2. Configure Provider Environment Variables

Saguaro uses OpenAI-compatible APIs. Local model servers, hosted providers, and compatible proxies can all work as long as they expose the expected endpoints.

Required for embeddings:

```bash
export EMBEDDINGS_BASE_URL="http://localhost:1234/v1"
export EMBEDDINGS_MODEL="text-embedding-bge-m3"
export EMBEDDINGS_API_KEY=""
```

Required for chat completions used by workflow runtime checks and knowledge synthesis:

```bash
export LLM_BASE_URL="http://localhost:1234/v1"
export LLM_MODEL="local-chat"
export LLM_API_KEY=""
```

Use your provider's real values. Empty API keys are only appropriate for providers that do not require authentication on your machine or network.

To enable the durable ChromaDB storage backend, set `VECTOR_STORE_BASE_URL`. If omitted, Saguaro falls back to the zero-config filesystem store.

```bash
export VECTOR_STORE_BASE_URL="http://localhost:8000"
export VECTOR_STORE_API_KEY=""          # omit or leave empty if not required
```

For committed project config, prefer env var names over secret values. A safe public config can say `api_key_env: EMBEDDINGS_API_KEY`; it must not contain the actual key.

Gemini CLI note: Gemini extensions treat declared settings as required install-time values. Saguaro's Gemini extension does not declare provider settings by default, so installation stays provider-neutral and quiet. In Gemini, prefer project-local `.saguaro/config.yaml` for provider base URLs and model names. If your provider requires API keys, use a Gemini workspace MCP override or another explicit Gemini env strategy until Saguaro ships first-class secure Gemini credential setup.

## 3. Initialize Your First Existing Project

Move into the project that should use Saguaro:

```bash
cd path/to/your-project
saguaro init
```

This creates:

```text
.saguaro/
├── config.yaml
└── workflows/
```

`config.yaml` stores provider URLs, model names, collection names, and env var names. It must not store secret values.

The config schema is documented in [config-and-env.md](./config-and-env.md). Some teams call this kind of file a project YAML; in Saguaro v1 the canonical project-local config path is `.saguaro/config.yaml`.

## 4. Verify The Setup

From the project root:

```bash
saguaro doctor
saguaro smoke
```

`doctor` checks whether embedding and chat endpoints visible through the CLI environment respond. Keep the same provider environment variables available to the harness process, not only to your interactive shell.

`smoke` verifies that memory and knowledge can store, retrieve, search, and query through the local Saguaro configuration.

## 5. Use Saguaro In A Harness

Restart the harness after installing or changing environment variables.

Then ask your agent:

```text
Use Saguaro. Check memory and knowledge first, then run the engineering workflow for this change.
```

For a direct workflow command:

```text
/workflow run engineering-lite --ticket improve-empty-state
```

Good first workflows:

| Workflow | Use When |
| --- | --- |
| `engineering-lite` | Small local changes with an obvious implementation path. |
| `engineering-standard` | Default feature and enhancement work. |
| `engineering-deep` | Architecture changes, migrations, high-risk work, or unclear blast radius. |
| `bugfix` | Reproduce, diagnose, fix, and verify a bug. |
| `product` | Turn a loose feature idea into user stories, scope boundaries, and acceptance criteria before engineering. |
| `security-audit` | Review trust boundaries, dependencies, abuse cases, and remediation. |
| `seo` | Combine search research, technical SEO, content strategy, implementation, and reporting. |

Useful first prompts:

```text
Use Saguaro. Retrieve project memories about this feature area, search knowledge for prior plans, then run engineering-standard for ticket add-bulk-actions.
```

```text
Use Saguaro. Run bugfix for ticket checkout-rounding-error. Require reproduction evidence before planning a fix.
```

```text
Use Saguaro. Run product for ticket saved-searches. Start by clarifying user stories and acceptance criteria.
```

## 6. Know Where State Lives

Saguaro keeps project state under `.saguaro/`:

```text
.saguaro/
├── config.yaml
├── workflows/
├── runs/
└── data/
```

The plugin itself is installed at user scope by the harness. Project state is not stored in the plugin cache.

## 7. Create Or Customize Workflows

Bundled workflows are a starting library, not a cage. Add project-specific workflows under `.saguaro/workflows/*.yaml`; project-local workflows shadow bundled workflows when they share the same `name`.

To create a new workflow with an agent, use the bundled `create-workflow` skill:

```text
/create-workflow support-triage
```

The skill asks for the workflow goal, required inputs, phases, approval gates, memory and knowledge requirements, then writes a draft YAML and validates it with `workflow_validate_yaml` when Saguaro workflow tools are available.

Authoring guide: [workflow-authoring.md](./workflow-authoring.md). Schema reference: [workflow-yaml-schema.md](./workflow-yaml-schema.md).

## 8. Update Existing Skills

Existing skills can become Saguaro-aware without becoming Saguaro-specific. Add memory and knowledge preflights, use workflows for phased work, and store durable lessons at closeout.

See [adopting-saguaro-in-existing-skills.md](./adopting-saguaro-in-existing-skills.md).

For a practical guide to invoking bundled skills and adding Saguaro to your own agents or skills, see [skills-and-agents.md](./skills-and-agents.md).

## Troubleshooting

If Saguaro tools do not appear in a harness:

1. Restart the harness.
2. Confirm the plugin is installed at user scope.
3. Confirm the relevant environment variables are visible to the harness process.
4. Run `saguaro doctor` from the target project.
5. Run the harness-specific plugin validation from [plugin-installation.md](./plugin-installation.md).

If memory or knowledge works in CLI smoke tests but not in the harness, the harness likely did not receive the same environment variables as your shell.
