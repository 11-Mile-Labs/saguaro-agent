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
3. Write `.saguaro/config.yaml` with project-local placeholders only. Use env var names, never secrets.
4. If the user asks for a starter workflow, copy a bundled workflow into `.saguaro/workflows/` and keep the name unchanged unless the user asks for a renamed local variant.
5. Explain the next commands:
   - `saguaro doctor`
   - `saguaro smoke`
   - `/workflow run engineering`
   - `node scripts/lint-workflow-yaml.mjs --user`

## Config template

Use this shape when the file is missing:

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

Use the user's configured environment values when they are available. The local endpoint values above are examples for an OpenAI-compatible provider; replace them with hosted provider values when that is what the project uses.

Do not read from user-home shell files and do not add private machine-specific paths.
