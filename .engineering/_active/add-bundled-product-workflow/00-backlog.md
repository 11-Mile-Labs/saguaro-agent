---
title: "Add bundled product workflow with specification phase"
slug: add-bundled-product-workflow
type: enhancement
priority: medium
complexity: medium
status: promoted
created: "2026-05-23"
---

# Add bundled `product` workflow

## Problem

The bundled engineering workflows assume requirements are either small (`engineering-lite`),
collapsed into one planning phase (`engineering-standard`), or ready for technical research
(`engineering-deep`). Some feature tickets need a dedicated **product specification** step
(user stories, testable acceptance criteria, explicit in/out of scope) before codebase
research and architecture.

## Proposal

Add `workflows/product.yaml` (and marketplace copies) with phases:

`intake → product-spec → research → architecture → impact → da → implement → review → docs`

- `product-spec` runs after intake and before `research`.
- Reuse existing portable agents (`planner`, `explore`, `architect`, `impact-analyzer`, etc.).
- Same DA approval gate pattern as `engineering-standard` and `engineering-deep`.
- Contract outputs on `product-spec` are structured fields (not host-specific artifact paths).

## Acceptance criteria

- [ ] `workflows/product.yaml` validates with `node scripts/lint-workflow-yaml.mjs`
- [ ] Documented in `workflows/README.md` with use-when / avoid-when guidance
- [ ] Marketplace harness copies updated (claude / codex / gemini)
- [ ] `workflow_list` exposes `product` on a project with default Saguaro config
- [ ] Smoke: `workflow_start({ name: "product", args: { ticket_slug, ticket_description }})`
      dispatches `product-spec` with a valid envelope

## Non-goals

- No consumer-specific orchestrator skills or private MCP servers in this repo
- No hard-coded artifact paths; hosts map `dispatch_contract` to their own ticket layout
- Not merging `product-spec` into `engineering-standard` unless a separate RFC proves
  equivalent quality

## Implementation notes

- Branch: `feature/bundled-product-workflow`
- Workflow `name: product`; phase id `product-spec`
- Reference shape: `engineering-deep.yaml` for post-spec technical phases
