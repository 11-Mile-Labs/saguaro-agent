# Config And Environment

Saguaro uses one project-local config file:

```text
.saguaro/config.yaml
```

That file belongs to the project using Saguaro, not to a home directory or machine-global shell profile.

## Example

```yaml
embeddings:
  base_url: "https://api.openai.com/v1"
  model: "text-embedding-3-small"
  api_key_env: EMBEDDINGS_API_KEY

llm:
  base_url: "https://api.openai.com/v1"
  model: "gpt-5.4"
  api_key_env: LLM_API_KEY
  temperature: 0

storage:
  # backend: chromadb | filesystem — optional; inferred from VECTOR_STORE_BASE_URL when omitted.
  backend: chromadb
  # vector_store_base_url: http://localhost:8000  # optional; env VECTOR_STORE_BASE_URL takes precedence.

redaction:
  enabled: true
  # Comma-separated rule names to disable if a rule breaks legitimate content.
  # Available built-ins: private-key, authorization-bearer, openai-style-token,
  # github-token, aws-access-key, assignment-secret.
  disabled_rules: ""
  # Comma-separated JavaScript regex patterns to protect from redaction.
  additional_allow_patterns: ""

memory:
  collection: "saguaro_memory"

knowledge:
  collection: "saguaro_knowledge"
  chunk_size: 900

defaults:
  model_tier: standard

model_tiers:
  claude:
    standard: claude-sonnet-4-6
    deep: claude-opus-4-7
    surgeon: claude-opus-4-7-extended-thinking
  codex:
    standard: gpt-5-codex-medium
    deep: gpt-5-codex-high
    surgeon: gpt-5-codex-pro
  gemini:
    standard: gemini-2.5-flash
    deep: gemini-2.5-pro
    surgeon: gemini-2.5-pro-thinking

workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
```

## Secret Handling

- YAML stores environment variable names such as `EMBEDDINGS_API_KEY`.
- YAML does not store the secret values themselves.
- The host harness passes those variables into the MCP server process at launch time.

## Backend Responsibilities

Saguaro uses OpenAI-compatible APIs for embeddings and optional answer synthesis, plus a configurable storage backend for durable vector persistence.

- `embeddings` points at an OpenAI-compatible embeddings endpoint. Saguaro calls `/embeddings` to produce vectors.
- `llm` points at an OpenAI-compatible chat completions endpoint. Saguaro calls `/chat/completions` for `knowledge_query` synthesis.
- `storage` controls where vectors and records are persisted and searched. The `filesystem` backend requires no external service and is the zero-config fallback. The `chromadb` backend is the first durable backend; it persists data to a running ChromaDB instance and runs server-side similarity search. If a configured backend is unreachable, the tool call fails with a clear error — Saguaro never silently falls back to `filesystem` when a durable backend was explicitly or implicitly requested.
- `memory.collection` names the sentence-to-paragraph memory collection.
- `knowledge.collection` names the document collection.
- `redaction` controls the built-in secret redaction guardrail. It defaults to enabled. Disable specific rules with `disabled_rules`, or add narrow regex allow patterns with `additional_allow_patterns` when a rule mangles legitimate content. Allow patterns protect the exact matched span, so include the surrounding assignment text when that is what triggers the rule.

## What Saguaro Will Not Read

Saguaro should not read user-home shell profiles, machine-local env files, or other home-directory config files.

If the host does not pass a required environment variable, the relevant tool should fail with a clear configuration error.

## Compatibility

The public Saguaro tool surface stays vendor-neutral. The v1 backend contract is intentionally small: OpenAI-compatible embeddings are required, a pluggable storage backend provides vector persistence and similarity search, and OpenAI-compatible chat completions can synthesize `knowledge_query` answers.

Local development can use LM Studio, Ollama's OpenAI-compatible server, hosted OpenAI, hosted Anthropic through an OpenAI-compatible proxy, or any equivalent provider. ChromaDB is supported as a durable vector store via `VECTOR_STORE_BASE_URL`, behind the same public `memory_*` and `knowledge_*` tool surface — no tool-name or client-side changes required. Additional external vector databases can be added behind the same storage contract without changing the public MCP tool names.

## Environment Aliases

Saguaro accepts these environment variable names directly. Every key also accepts a `SAGUARO_`-prefixed override form (e.g. `SAGUARO_EMBEDDINGS_BASE_URL` overrides `EMBEDDINGS_BASE_URL`).

**Embeddings** — text → vector (`/embeddings`):

- `EMBEDDINGS_BASE_URL`
- `EMBEDDINGS_MODEL`
- `EMBEDDINGS_API_KEY`

**LLM** — prompt → answer (`/chat/completions`, used by `knowledge_query` synthesis):

- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_API_KEY`

**Storage backend** — vector persistence:

- `SAGUARO_STORAGE_BACKEND` — `chromadb` or `filesystem`; inferred from `VECTOR_STORE_BASE_URL` when omitted.
- `VECTOR_STORE_BASE_URL` — base URL of the ChromaDB instance (e.g. `http://localhost:8000`).
- `VECTOR_STORE_API_KEY` — API key for the vector store, if required.

## Per-Call Project Isolation

All `memory_*` and `knowledge_*` tools accept an optional `project_id` argument. When set, Saguaro scopes all reads and writes to that project workspace, allowing one running server to serve multiple projects without data leakage between them.

`project_id` must be a slug matching `[A-Za-z0-9][A-Za-z0-9._-]*` with no `..` components. When omitted, the server uses its configured default workspace.

The `global` scope is always cross-project: a `global`-scoped memory or knowledge document is shared across every workspace regardless of any `project_id` argument.
