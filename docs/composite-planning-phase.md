# Composite Planning Phase

`engineering-standard` uses a composite `plan` phase to reduce handoff overhead
without losing the rigor of research, architecture, impact analysis, and
verification planning.

The `plan` phase is not an opaque generic task. It must synthesize upstream
intake context into the sections below and produce the workflow contract outputs
declared in `workflows/engineering-standard.yaml`.

## Required Sections

```markdown
## Research Findings
- Known relevant prior work
- Unknowns investigated
- External docs or local code facts checked

## Architecture
- Proposed shape
- Files/modules likely touched
- Data contracts affected
- Alternatives rejected

## Impact
- Blast radius
- User-visible behavior
- Migration or rollback risk
- Security/privacy concerns

## Verification Plan
- Focused tests
- Type/build checks
- Manual smoke checks

## Implementation Plan
- Ordered steps
- Files to change
- Done criteria
```

## Required Saguaro Calls

The standard plan phase requires both memory and knowledge retrieval. Agents
must call `memory_retrieve` and `knowledge_search` or `knowledge_query` before
producing the final plan artifact, passing `run_id` and `phase_id` when running
inside a workflow dispatch.

`engineering-lite` requires memory only by default. `engineering-deep` keeps
memory and knowledge checks on separated research, architecture, and impact
phases.

## Specialist Escalations

Specialists are escalation tools, not default participants. The plan phase may
emit `specialist_escalations` when the work needs focused review before
implementation.

| Escalation | Specialist | Trigger |
|---|---|---|
| `frontend_review` | React/Next specialist | UI state, rendering, accessibility, app-router behavior |
| `data_review` | DB/API specialist | schema, migration, persistence, queue semantics |
| `security_review` | security specialist | auth, secrets, permissions, external input |
| `performance_review` | performance specialist | cache, query, bundle, egress, latency risk |

Example:

```yaml
specialist_escalations:
  - type: security_review
    reason: "Touches auth middleware and signed cookies"
    required_before: implement
```

If `specialist_escalations` is empty or omitted, the default path remains
single-agent through planning. The DA phase should explicitly challenge whether
empty escalations are correct.
