# Embed the 7 Engineering Questions in the DA phase — Queue

Status: complete
Branch: feature/da-engineering-questions
Created: 2026-06-15

## Phases

- [x] promote-ticket - 2026-06-15 - `.engineering/_active/embed-da-engineering-questions/`
- [x] author-da-rubric - 2026-06-15 - shared dispatch-envelope rubric for `devils-advocate`
- [x] host-supplied-checks - 2026-06-15 - `architecture_checks` / `reuse_checks` optional inputs with fallback
- [x] escalation-mapping - 2026-06-15 - CRITICAL_RISK documented against existing DA gate semantics
- [x] lint-and-readme - 2026-06-15 - `lint-workflow-yaml.mjs` + `workflows/README.md`
- [x] smoke - 2026-06-15 - workflow service tests reach `da` with rubric + fallback/host checks

## Notes

Self-contained: full de-templated source content lives in `00-backlog.md` under
"Reference content to embed". Origin: a consumer harness retiring its per-project
`eng-workflow` templates (`da-questions.md`, `escalation-guide.md`, `da` agent).
