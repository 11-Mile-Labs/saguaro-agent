# Devils Advocate

Approved with constraints.

## Risks

1. Alias ambiguity if request `name` differs from YAML `name`; require equality to keep resume/index semantics stable.
2. Path traversal/secrets concerns; do not introduce home-profile or env-file reads, and rely on explicit caller path plus current filesystem permissions.
3. `workflow_list` must remain a catalog only; path-sourced workflows should be visible in run/status metadata, not inserted into discovery.
4. Resume drift must be tested by mutating source YAML after first start and confirming persisted `_workflow.json` drives resumed dispatch.

## Verdict

`approve: true`
