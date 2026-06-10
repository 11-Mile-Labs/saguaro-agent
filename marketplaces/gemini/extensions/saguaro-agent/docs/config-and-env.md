# Project Config Schema

Saguaro uses one project-local config file:

```text
.saguaro/config.yaml
```

This is the Saguaro project YAML surface. Some teams may describe it generically as `project.yaml`, but the canonical v1 path is `.saguaro/config.yaml`.

The file belongs to the project using Saguaro. It should be safe to commit only when provider URLs are public, generic, or intentionally local, and when the file contains model names, collection names, and environment variable names instead of secret values. Do not commit private hostnames, LAN addresses, customer infrastructure, account identifiers, or tokens.

## Complete Example

```yaml
embeddings:
  base_url: "https://api.openai.com/v1"
  model: "text-embedding-3-small"
  api_key_env: EMBEDDINGS_API_KEY

llm:
  base_url: "https://api.openai.com/v1"
  model: "hosted-chat-model"
  api_key_env: LLM_API_KEY
  temperature: 0

storage:
  backend: filesystem

redaction:
  enabled: true
  disabled_rules: ""
  additional_allow_patterns: ""

memory:
  collection: "saguaro_memory"
  data_dir: ".saguaro/data/memory"

knowledge:
  collection: "saguaro_knowledge"
  data_dir: ".saguaro/data/knowledge"
  chunk_size: 900

defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]

model_tiers:
  claude:
    standard: claude-standard-model
    deep: claude-deep-model
    surgeon: claude-high-reasoning-model
  codex:
    standard: codex-standard-model
    deep: codex-deep-model
    surgeon: codex-high-reasoning-model
  gemini:
    standard: gemini-standard-model
    deep: gemini-deep-model
    surgeon: gemini-high-reasoning-model

workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
```

For public repositories, prefer omitting `storage.vector_store_base_url`. Pass the ChromaDB URL through the harness environment as `VECTOR_STORE_BASE_URL` unless the URL is intentionally public or local and safe to commit.

## Minimal Filesystem Config

Use this when you want a zero-config local store:

```yaml
embeddings:
  base_url: "http://localhost:1234/v1"
  model: "text-embedding-bge-m3"
  api_key_env: EMBEDDINGS_API_KEY

llm:
  base_url: "http://localhost:1234/v1"
  model: "local-chat"
  api_key_env: LLM_API_KEY
  temperature: 0

storage:
  backend: filesystem

memory:
  collection: "saguaro_memory"

knowledge:
  collection: "saguaro_knowledge"
  chunk_size: 900

workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
```

## Minimal ChromaDB Config

Use this when the vector store URL is supplied by the harness environment:

```yaml
embeddings:
  base_url: "https://api.openai.com/v1"
  model: "text-embedding-3-small"
  api_key_env: EMBEDDINGS_API_KEY

llm:
  base_url: "https://api.openai.com/v1"
  model: "hosted-chat-model"
  api_key_env: LLM_API_KEY

storage:
  backend: chromadb

memory:
  collection: "saguaro_memory"

knowledge:
  collection: "saguaro_knowledge"
```

Then pass:

```bash
export VECTOR_STORE_BASE_URL="http://localhost:8000"
export VECTOR_STORE_API_KEY="" # optional
```

## Schema Reference

The workflow server validates project config with the schema below. Memory and knowledge servers accept the same public shape but also preserve backward-compatible aliases such as `memory.path` and `knowledge.path`. Keep the file small and explicit.

| Field | Type | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `embeddings` | object | Yes | none | OpenAI-compatible embedding endpoint used by memory and knowledge retrieval. |
| `llm` | object | No | none | OpenAI-compatible chat endpoint used by `knowledge_query` synthesis and runtime checks. |
| `storage` | object | No | inferred | Storage backend selection and optional vector store URL. |
| `redaction` | object | No | enabled by runtime defaults | Secret redaction controls for memory and knowledge writes. |
| `memory` | object | No | runtime defaults | Memory collection and local filesystem path settings. |
| `knowledge` | object | No | runtime defaults | Knowledge collection, local path, and chunking settings. |
| `defaults` | object | No | workflow defaults | Default model tier, effort, and lookup scopes. |
| `model_tiers` | object | No | none | Harness-specific concrete model names for logical tiers. |
| `workflows_dir` | string | No | `.saguaro/workflows` | Project-local workflow directory. |
| `runs_dir` | string | No | `.saguaro/runs` | Workflow run state directory. |

### `embeddings`

```yaml
embeddings:
  base_url: "https://api.openai.com/v1"
  model: "text-embedding-3-small"
  api_key_env: EMBEDDINGS_API_KEY
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `base_url` | string | Recommended | Base URL for an OpenAI-compatible API. |
| `url` | string | No | Backward-compatible alias accepted by runtime config. Prefer `base_url`. |
| `model` | string | Recommended | Embedding model name. |
| `api_key_env` | string | Yes | Name of the environment variable containing the API key. |
| `collection` | string | No | Accepted by the shared endpoint schema, but collection names usually belong under `memory` and `knowledge`. |

### `llm`

```yaml
llm:
  base_url: "https://api.openai.com/v1"
  model: "hosted-chat-model"
  api_key_env: LLM_API_KEY
  temperature: 0
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `base_url` | string | Recommended | Base URL for an OpenAI-compatible chat API. |
| `url` | string | No | Backward-compatible alias accepted by runtime config. Prefer `base_url`. |
| `model` | string | Recommended | Chat model name. |
| `api_key_env` | string | Yes when `llm` is present | Name of the environment variable containing the API key. |
| `temperature` | number | No | Provider temperature setting for synthesis. |
| `collection` | string | No | Accepted by the shared endpoint schema but rarely useful here. |

### `storage`

```yaml
storage:
  backend: chromadb
  vector_store_base_url: "http://localhost:8000"
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `backend` | `filesystem` or `chromadb` | No | Explicit backend selector. |
| `vector_store_base_url` | string | No | ChromaDB base URL. Env vars take precedence. |

Storage backend resolution order:

1. `storage.backend` in `.saguaro/config.yaml`
2. `SAGUARO_STORAGE_BACKEND`
3. infer `chromadb` when `SAGUARO_VECTOR_STORE_BASE_URL` or `VECTOR_STORE_BASE_URL` is set
4. fall back to `filesystem`

ChromaDB URL resolution order:

1. `SAGUARO_VECTOR_STORE_BASE_URL`
2. `VECTOR_STORE_BASE_URL`
3. `storage.vector_store_base_url`

If `chromadb` is selected and no URL is available, the tool call fails. Saguaro does not silently fall back to `filesystem` when a durable backend was selected.

### `redaction`

```yaml
redaction:
  enabled: true
  disabled_rules: ""
  additional_allow_patterns: ""
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `enabled` | boolean | No | Set `false` only for controlled tests or special internal tooling. |
| `disabled_rules` | string | No | Comma-separated built-in rule names to disable. |
| `additional_allow_patterns` | string | No | Comma-separated JavaScript regex patterns whose matches should be protected from redaction. |

Built-in redaction is a guardrail, not permission to store secrets. Do not intentionally put tokens, keys, private infrastructure, client data, or personal machine details into memory or knowledge.

### `memory`

```yaml
memory:
  collection: "saguaro_memory"
  data_dir: ".saguaro/data/memory"
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `collection` | string | No | `saguaro_memory` | Base collection name for memory records. |
| `data_dir` | string | No | `.saguaro/data/memory` | Filesystem backend data directory. |
| `path` | string | No | `.saguaro/data/memory` | Alias for `data_dir`; prefer `data_dir`. |

### `knowledge`

```yaml
knowledge:
  collection: "saguaro_knowledge"
  data_dir: ".saguaro/data/knowledge"
  chunk_size: 900
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `collection` | string | No | `saguaro_knowledge` | Base collection name for knowledge documents. |
| `data_dir` | string | No | `.saguaro/data/knowledge` | Filesystem backend data directory. |
| `path` | string | No | `.saguaro/data/knowledge` | Alias for `data_dir`; prefer `data_dir`. |
| `chunk_size` | positive integer | No | runtime default | Approximate content chunk size for document ingestion. |

### `defaults`

```yaml
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
```

| Field | Type | Required | Default | Allowed Values |
| --- | --- | --- | --- | --- |
| `model_tier` | string | No | `standard` | `standard`, `deep`, `surgeon` |
| `effort` | string | No | `medium` | `low`, `medium`, `high` |
| `memory_scope` | string array | No | `[run, project]` | `run`, `project`, `global` |
| `knowledge_scope` | string array | No | `[project]` | Use `project` and `global`; `run` is reserved for future run-scoped knowledge behavior. |

Workflow phase defaults can override these at the workflow level. Phase-level values override workflow defaults.

### `model_tiers`

```yaml
model_tiers:
  codex:
    standard: codex-standard-model
    deep: codex-deep-model
    surgeon: codex-high-reasoning-model
```

Supported harness keys:

- `claude`
- `codex`
- `gemini`

Supported tier keys:

- `standard`
- `deep`
- `surgeon`

Workflows should use logical tiers, not concrete model names. This keeps a workflow portable across harnesses.

### `workflows_dir`

```yaml
workflows_dir: .saguaro/workflows
```

Relative paths resolve from the project root. Project workflows shadow bundled workflows by `name`.

### `runs_dir`

```yaml
runs_dir: .saguaro/runs
```

Relative paths resolve from the project root. Saguaro stores workflow run state, dispatch logs, artifacts, and ticket indexes here.

## Environment Variables

Every provider key also accepts a `SAGUARO_`-prefixed override form.

| Purpose | Primary Env Var | Override Env Var |
| --- | --- | --- |
| Embeddings base URL | `EMBEDDINGS_BASE_URL` | `SAGUARO_EMBEDDINGS_BASE_URL` |
| Embeddings model | `EMBEDDINGS_MODEL` | `SAGUARO_EMBEDDINGS_MODEL` |
| Embeddings API key | `EMBEDDINGS_API_KEY` | `SAGUARO_EMBEDDINGS_API_KEY` |
| Chat base URL | `LLM_BASE_URL` | `SAGUARO_LLM_BASE_URL` |
| Chat model | `LLM_MODEL` | `SAGUARO_LLM_MODEL` |
| Chat API key | `LLM_API_KEY` | `SAGUARO_LLM_API_KEY` |
| Storage backend | none | `SAGUARO_STORAGE_BACKEND` |
| ChromaDB URL | `VECTOR_STORE_BASE_URL` | `SAGUARO_VECTOR_STORE_BASE_URL` |
| ChromaDB API key | `VECTOR_STORE_API_KEY` | `SAGUARO_VECTOR_STORE_API_KEY` |

## Global Env File (`~/.saguaro/env`)

Desktop harnesses (Claude Desktop, Codex app, Cursor, and similar) launch MCP servers without a login shell, so variables exported from `~/.zshrc`, `~/.localrc`, or other profile scripts never reach the server process. The global env file closes that gap.

At startup, each Saguaro MCP server loads a machine-wide dotenv file:

```text
~/.saguaro/env
```

Format is standard dotenv: `KEY=VALUE` pairs, `#` comments, blank lines, an optional `export ` prefix, and optional single or double quotes around values.

```bash
# ~/.saguaro/env
EMBEDDINGS_API_KEY=sk-...
LLM_API_KEY=sk-...
VECTOR_STORE_BASE_URL=http://localhost:8000
```

Precedence rules:

1. Variables already present in the process environment always win — even when set to an empty string. Terminal launches behave exactly as before.
2. File values fill in only what is missing.
3. A missing file is a silent no-op.

Path resolution order:

1. `SAGUARO_GLOBAL_ENV` — exact file path override
2. `$SAGUARO_HOME/env` when `SAGUARO_HOME` is set
3. `~/.saguaro/env`

The file is machine-local. Never commit it, and never place secrets in project config or harness MCP JSON when this file can hold them instead.

## What Saguaro Will Not Read

Saguaro reads project-local `.saguaro/config.yaml`, process environment variables passed by the host MCP configuration, and the global env file described above.

It should not read:

- shell startup files
- machine-local profile scripts
- private project config outside the target project

If a required environment variable is absent from the process environment and the global env file, the relevant tool should fail with a clear configuration error.

## Per-Call Project Isolation

All `memory_*` and `knowledge_*` tools accept an optional `project_id` argument. When set, Saguaro scopes reads and writes to that project workspace, allowing one running server to serve multiple projects without data leakage between them.

`project_id` must match `[A-Za-z0-9][A-Za-z0-9._-]*`, must start with an alphanumeric character, and must not contain `..`.

The `global` scope is always cross-project. A global memory or knowledge document is shared regardless of `project_id`.
