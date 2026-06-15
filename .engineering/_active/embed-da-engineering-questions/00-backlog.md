---
title: "Embed the 7 Engineering Questions + escalation states in the DA phase"
slug: embed-da-engineering-questions
type: enhancement
priority: medium
complexity: medium
status: promoted
created: "2026-06-15"
---

# Embed the 7 Engineering Questions + escalation protocol in the `da` phase

## Problem

The bundled engineering workflows (`engineering-lite`, `engineering-standard`,
`engineering-deep`, and `product`) run a `da` (Devil's Advocate) phase that today
emits a free-form Verdict / Rationale / Conditions / Risks document. It carries an
approval-gate contract, but it does **not** carry a standardized challenge
framework. The DA gets to "approve / block" without a consistent rubric.

That rubric historically existed as the **"7 Engineering Questions"** plus a
three-state **escalation protocol** (BLOCKED / CRITICAL_RISK / CONTEXT_DRIFT) and a
severity scale. But that content only ever lived in *consumer* harness templates (a
per-project `eng-workflow` skill + a `{{PREFIX}}-da` agent), heavily `{{templated}}`
per project. Those templates are being retired by consumers in favor of
saguaro-native workflows.

To avoid losing accumulated review rigor, the framework should move **down into the
saguaro-agent `da` phase itself**, in a portable form (no `{{PREFIX}}`, no
host-specific artifact paths), so every consumer gets a consistent DA gate without
re-templating it.

## Proposal

Embed the 7 Engineering Questions, the severity scale, and the escalation states
into the `da` phase prompt/contract shared by the bundled engineering workflows.

- The DA phase prompt instructs the agent to address all 7 questions explicitly
  ("not applicable, because …" is an acceptable answer; zero challenges is itself a
  red flag).
- Project-specific portions — **Question 4** (architecture compliance) and
  **Question 6** (reuse / what-already-exists) — must be supplied as **contract
  inputs** the host maps from its own rules (e.g. its architecture rules), NOT
  hardcoded into the workflow. If the host supplies nothing, fall back to generic
  phrasing.
- Map the three escalation states onto existing saguaro semantics:
  - `CRITICAL_RISK` → the existing DA approval gate `block` path (already exists).
  - `BLOCKED` / `CONTEXT_DRIFT` → structured output fields the host surfaces; do not
    invent new host message formats in this repo.
- Severity scale (Critical / Moderate / Minor) drives the gate: only **Critical**
  blocks; Moderate/Minor are advisory.
- Prefer a single shared phase-prompt include over copy-pasting into each
  `engineering-*.yaml` if the workflow format supports it; otherwise keep them in
  sync and lint for drift.

## Acceptance criteria

- [ ] `da` phase prompt for `engineering-lite`, `engineering-standard`,
      `engineering-deep`, and `product` carries the 7 Questions + severity scale.
- [ ] Question 4 / Question 6 project specifics are contract inputs (host-supplied),
      with a generic fallback — verified by a workflow that supplies neither.
- [ ] Escalation: `CRITICAL_RISK` resolves to the existing `block` gate; the gate
      still requires explicit approval to proceed (no auto-advance on `approve: true`
      phase output alone).
- [ ] Workflow YAML validates with `node scripts/lint-workflow-yaml.mjs`.
- [ ] Marketplace harness copies updated (claude / codex / gemini) if the prompt
      lives in copied workflow files.
- [ ] Smoke: a `workflow_start` run reaches `da` and the dispatched envelope
      contains the 7-question instruction + any host-supplied arch/reuse checks.
- [ ] `workflows/README.md` notes the DA rubric and how hosts pass arch/reuse checks.

## Non-goals

- No `{{PREFIX}}` / per-project templating in this repo.
- No host-specific artifact paths or message-to-user formats baked into the workflow.
- SEO-specific DA checks and other domain `da_checks` (from the legacy template) are
  **host/pipeline extensions**, out of scope for the core engineering `da` phase —
  hosts can append them via contract inputs later.
- Not changing the DA output document shape beyond adding the rubric.

## Implementation notes

- Branch: `feature/da-engineering-questions`
- Reference shape: the existing `da` phase in `engineering-standard.yaml` /
  `engineering-deep.yaml`.
- Origin of this salvage: a consumer harness is retiring its per-project
  `eng-workflow` templates (`da-questions.md`, `escalation-guide.md`) and its `da`
  agent; the rubric is being moved down into the portable `da` phase.
- The full de-templated source content is reproduced below so this ticket is
  self-contained — no need to reach into any consumer repo.

---

## Reference content to embed (de-templated)

### The 7 Engineering Questions

The DA phase applies these to every engineering ticket before implementation is
allowed to proceed. Every question must be addressed — even if the answer is "not
applicable" with a documented reason.

**1. Is this the simplest solution?**
Could we achieve 80% of the value with 30% of the complexity? Look for:
over-engineered abstractions for one-time operations; new libraries when built-ins
exist; complex state management when simpler patterns work; building for hypothetical
scale that isn't needed.

**2. Are we building for a real need or a hypothetical one?**
Is there a concrete user/operator scenario, or are we building "just in case"? Look
for: features without a clear operator workflow; "future-proofing" that adds
complexity now; config options nobody will change; edge cases that may never occur.

**3. What's the blast radius?**
If this breaks, what else breaks? How many pages, routes, apps, or packages are
affected? Is the blast radius proportional to the value delivered? Look for: changes
to shared components used widely; schema migrations touching production data; API
route changes affecting multiple consumers; CSS/styling changes with cascading
effects.

**4. Does this respect the project architecture?** *(host-supplied checks)*
Is this consistent with established decisions? Does it put code in the right place?
Does it follow established patterns? Check against the project's architecture rules —
supplied by the host as a contract input (e.g. from `architecture.md`). Generic
fallback when none supplied: "consistency with stated invariants and module
boundaries."

**5. What's the rollback plan?**
If this goes wrong in production, can we revert cleanly? Is the migration reversible?
What happens to data created between deploy and rollback? Look for: irreversible
schema migrations (column drops, renames); lossy data transformations; external
service integrations that can't be undone; changes that affect SEO rankings (weeks to
recover).

**6. Have we checked what already exists?** *(host-supplied checks)*
Is there an existing component, utility, hook, or pattern to reuse? Are we about to
duplicate code that already exists? Check against host-supplied reuse targets;
generic fallback: "search the codebase for existing equivalents before adding new
code."

**7. What maintenance burden does this create?**
Who maintains this after it ships? Does it add operational complexity? Look for: new
dependencies needing version management; cron/scheduled tasks needing monitoring;
external API integrations that could break; content needing regular updates; database
tables that grow unbounded.

### Severity scale

| Level | Definition | Action |
|-------|-----------|--------|
| **Critical** | Would break production, cause data loss, create a security vulnerability, or violate a core architectural decision | BLOCK implementation — requires explicit approval to proceed |
| **Moderate** | Weakens the approach but doesn't invalidate it | FLAG — must be addressed before or during implementation |
| **Minor** | Style, naming, approach preference | NOTE — decider chooses whether to address |

### Rules

- Finding zero challenges is itself a red flag. Document why each question doesn't apply.
- Challenge with evidence or reasoning, never personal preference.
- Do NOT redesign the solution — challenge it and propose alternatives.
- Only Critical severity blocks implementation. Moderate issues do not block.

### Escalation states

**BLOCKED** — Agent cannot complete its work: missing information, ambiguous
requirement, or a decision only the operator can make. Surface as a structured
blocker (description + source) and stop; do not advance the phase.

**CRITICAL_RISK** — Showstopper: would break production, cause data loss, create a
security vulnerability, or is fundamentally unimplementable. Resolves to the existing
`da` approval-gate `block` path. Implementation must not proceed until the operator
reviews and either corrects the approach (affected phases re-run) or explicitly
accepts the risk with written rationale.

**CONTEXT_DRIFT** — The work is technically sound but is solving the wrong problem or
has expanded in scope versus the intake/root-cause. Surface original request vs.
current direction vs. drift detected, and request confirmation before proceeding.
