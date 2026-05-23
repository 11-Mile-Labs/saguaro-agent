# AGENTS.md

This repository publishes the public OSS surface for Saguaro.

## Project Purpose

`11-Mile-Labs/saguaro-agent` provides a vendor-neutral workflow engine plus persistent memory and durable knowledge for AI coding harnesses. The public product surface is:

- `saguaro-workflow`
- `saguaro-memory`
- `saguaro-knowledge`

Public tool families are:

- `workflow_*`
- `memory_*`
- `knowledge_*`

## Scope

Included in v1:

- Cross-harness workflow orchestration
- Project-local `.saguaro/config.yaml` configuration
- Workflow schema, validation, dispatch logging, and run state
- Memory and knowledge retrieval with run, project, and global scopes
- Thin wrapper skills that invoke public Saguaro workflows
- Public manifests for Claude Code, Codex, and Gemini CLI
- User-scope marketplace and extension install artifacts for supported harnesses

Excluded from v1:

- Private business workflows
- Harness-specific private agent definitions
- Compatibility tool names outside `workflow_*`, `memory_*`, and `knowledge_*`
- Reads from user-home shell profiles, machine-local env files, or other home-directory files
- Secrets stored in repository config files
- Product copy that depends on private internal context

## Public Surface Rules

1. Keep the public API names stable and readable. Use `workflow_*`, `memory_*`, and `knowledge_*` only.
2. Treat the 1% rule as a product contract. If there is even a 1% chance memory or knowledge may matter, agents should query it first.
3. Keep configuration project-local. `.saguaro/config.yaml` names environment variables but never stores secrets.
4. Keep manifests explicit. They should pass environment variables by name or placeholder and must not source shell startup files.
5. Keep docs vendor-neutral. Saguaro can talk to OpenAI-compatible backends, but the docs should not hardcode one internal system or one local machine.
6. It is okay to describe Saguaro's origins in generic product terms: real development need, curiosity, agent collaboration, and lost-context friction. Do not name private projects, clients, internal systems, or personal machine details unless the repository explicitly marks them as public examples.

## Layout

- `docs/` - public product documentation
- `mcp-servers/` - workflow, memory, knowledge, and shared core implementation
- `marketplaces/` - generated install artifacts for Claude Code, Codex, and Gemini CLI
- `scripts/build-marketplaces.mjs` - builds marketplace artifacts from source files
- `install.sh` - user-scope installer for detected harness CLIs
- `skills/workflow/` - generic workflow runner skill surface
- `skills/saguaro/` - project initialization skill surface
- `workflows/` - bundled reference workflows
- `examples/` - end-to-end demos for the public surface

## Provenance

Every public artifact added here must be checked for:

- Original authorship or a clear right to publish
- License compatibility
- Neutral public wording
- Absence of private infrastructure, secrets, or machine-local assumptions

When in doubt, remove the private detail or keep the item out of this repository.
