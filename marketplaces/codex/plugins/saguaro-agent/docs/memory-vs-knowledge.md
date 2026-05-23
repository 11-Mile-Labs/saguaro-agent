# Memory Vs. Knowledge

Saguaro separates short durable lessons from longer durable documents.

## Use Memory For

- observations from a run
- decisions worth repeating later
- gotchas and anti-patterns
- concise lessons learned

Memory entries are intentionally small: usually a sentence or short paragraph.

## Use Knowledge For

- specs
- research briefs
- design docs
- decision records
- methodology documents
- reference material you expect to query more than once

Knowledge entries are document-scale and return ranked chunks for synthesis.

## Storage And Retrieval

Memory and knowledge both keep local durable manifests with embedded vectors for semantic retrieval.

- Memory manifests default to `.saguaro/data/memory/{run,project,global}.json`.
- Knowledge manifests default to `.saguaro/data/knowledge/{project,global}.json`.
- The manifests store redacted text, metadata, and embeddings needed for vector retrieval.
- Any OpenAI-compatible chat completions endpoint can synthesize `knowledge_query` answers after Saguaro retrieves relevant chunks.

Before content is written locally or embedded, Saguaro runs a built-in redaction pass for common secret shapes such as bearer tokens, private keys, API key assignments, GitHub tokens, and AWS access keys.

Redaction is config-driven and defaults to enabled. Projects can disable specific built-in rules or add narrow regex allow patterns in `.saguaro/config.yaml` when a rule corrupts legitimate content.

## Scope Model

| Scope | Memory | Knowledge | Notes |
| --- | --- | --- | --- |
| `run` | Yes | No | Fast local lessons captured during a workflow run. |
| `project` | Yes | Yes | Default durable scope for one repository or codebase. |
| `global` | Yes | Yes | Cross-project patterns and references. |

## Default Behavior

- `memory_store` defaults to `run`
- `memory_retrieve` searches across scopes by relevance when scope is omitted
- `knowledge_ingest` defaults to `project`
- `knowledge_search` and `knowledge_query` search broadly when scope is omitted

## The 1% Rule In Practice

If there is even a 1% chance a prior lesson already exists, call `memory_retrieve`.

If there is even a 1% chance a prior spec, brief, or reference already exists, call `knowledge_search` or `knowledge_query`.

The point is not ceremony. The point is to stop making the agent rediscover what the project already knows.
