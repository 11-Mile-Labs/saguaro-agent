---
name: saguaro
description: "Initialize a project-local Saguaro scaffold with config and workflow directories."
argument-hint: "[init]"
license: MIT
---

# Saguaro

Use this skill for `/saguaro init`.

## Goal

Create the smallest safe project-local Saguaro scaffold:

- `.saguaro/config.yaml`
- `.saguaro/workflows/`

## Steps

1. Confirm the target project root from the current working directory.
2. Create `.saguaro/` and `.saguaro/workflows/` if they do not already exist.
3. Write `.saguaro/config.yaml` with project-local placeholders only. Use env var names, never secrets. Include an explicit `storage` block, but choose it from visible runtime config or a user answer instead of blindly assuming a backend.
4. If the user asks for a starter workflow, copy a bundled workflow into `.saguaro/workflows/` and keep the name unchanged unless the user asks for a renamed local variant.
5. Explain the next commands:
   - `saguaro doctor`
   - `saguaro smoke`
   - `/workflow run engineering`
   - `node scripts/lint-workflow-yaml.mjs --user`

## Config template

Use this shape when the file is missing, but generate the `storage` block dynamically:

1. If `SAGUARO_STORAGE_BACKEND=filesystem` is visible in the current process env, write `backend: filesystem`.
2. Else if `SAGUARO_VECTOR_STORE_BASE_URL` or `VECTOR_STORE_BASE_URL` is visible, use it to infer `backend: chromadb`.
   - For public or OSS repositories, do not copy machine-local, LAN, client, tenant, or private infrastructure URLs into `.saguaro/config.yaml` unless the user explicitly confirms that value is safe to commit.
   - If the value is safe and confirmed, write it into `storage.vector_store_base_url`.
   - If the value is private or commit-safety is unclear, omit `storage.vector_store_base_url` and tell the user the host harness must pass `VECTOR_STORE_BASE_URL` at runtime.
3. Else if `SAGUARO_STORAGE_BACKEND=chromadb` is visible but no vector-store URL is visible, ask for the ChromaDB base URL before writing the config.
4. Else ask the user whether this project should use durable ChromaDB storage or the zero-config filesystem fallback. If they choose ChromaDB, ask for the ChromaDB base URL. If they choose filesystem, write `backend: filesystem` and omit `vector_store_base_url`.

Use this ChromaDB shape for public-safe configs when the URL should come from runtime env:

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
  backend: chromadb

redaction:
  enabled: true
  disabled_rules: ""
  additional_allow_patterns: ""

memory:
  collection: "saguaro_memory"

knowledge:
  collection: "saguaro_knowledge"
  chunk_size: 900

workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
```

For private/local configs where the user confirms the URL is safe to write, include:

```yaml
storage:
  backend: chromadb
  vector_store_base_url: "http://localhost:8000"
```

Use this filesystem shape only when the user or visible env explicitly chooses filesystem:

```yaml
storage:
  backend: filesystem
```

Use the user's configured environment values when they are available. The local endpoint values above are examples for an OpenAI-compatible provider; replace them with hosted provider values when that is what the project uses.

Do not read from user-home shell files. Never add private machine-specific paths, LAN IPs, client names, private project names, tokens, account identifiers, or other personal information to public OSS docs, templates, marketplace artifacts, or generated configs intended to be committed.
