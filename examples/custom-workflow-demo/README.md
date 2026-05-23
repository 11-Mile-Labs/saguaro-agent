# Custom Workflow Demo

This example shows a project-local workflow in `.saguaro/workflows/` that augments the bundled library without touching plugin files.

## What it demonstrates

- A local workflow file with a parallel discovery layer.
- A project-local `.saguaro/config.yaml`.
- A tiny docs-oriented workspace that does not need application code to explain the pattern.

## Try it

```text
/workflow run release-slice --ticket docs-release-note
```
