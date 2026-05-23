# Contributing

Thanks for helping build Saguaro in public.

## Curation Bar

1. **Public OSS voice only.** Keep docs, manifests, examples, and comments professional and vendor-neutral.
2. **Project-local configuration only.** Saguaro reads `.saguaro/config.yaml` and environment variables passed by the host. Do not add reads from shell startup files, home-directory dotfiles, or machine-local paths.
3. **Stable public naming.** Use `workflow_*`, `memory_*`, and `knowledge_*` for the public tool surface. Do not add additional public tool families here.
4. **The 1% rule is product behavior.** If a change touches memory or knowledge docs, manifests, or contracts, preserve the rule that agents should query those systems first whenever there is even a 1% chance they are relevant.
5. **Self-contained public artifacts.** Docs, workflows, examples, and skills should point only at files that ship in this repository or at project-local `.saguaro/` paths. Do not depend on hidden private repos, home-directory config, or unpublished local assets.
6. **Secrets never in git.** YAML and JSON files may name environment variables, but they must not embed secret values.
7. **Provenance required.** New public content needs an authorship and license check before merge.

## Docs And Manifest Rules

- README and `docs/*.md` files define the intended public surface. Keep them aligned with the actual MCP and workflow naming.
- Plugin manifests must register only the public Saguaro MCP servers:
  - `saguaro-workflow`
  - `saguaro-memory`
  - `saguaro-knowledge`
- Manifests should pass env vars by name or placeholder, never by sourcing user-home shell profiles or similar files.
- If a manifest needs a harness-specific path placeholder, document the assumption in the change summary so it can be validated in runtime smoke tests.

## Workflow And Schema Changes

When changing workflow docs or schema expectations:

- update [docs/workflow-yaml-schema.md](./docs/workflow-yaml-schema.md)
- update [docs/dispatch-logging.md](./docs/dispatch-logging.md) if validation or tracing changes
- update [docs/semver-and-compatibility.md](./docs/semver-and-compatibility.md) if compatibility rules move

## Before Opening A PR

Run the repository checks that exist for the current implementation state:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If implementation is not ready for one of those checks yet, call it out explicitly in the PR description or review summary.
