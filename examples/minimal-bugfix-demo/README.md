# Minimal Bugfix Demo

This example is the smallest realistic project that can use the bundled `bugfix` workflow.

## What is here

- `src/discount.js` contains a tiny pricing bug.
- `test/discount.test.js` captures the intended behavior.
- `.saguaro/config.yaml` shows a project-local Saguaro config with placeholder env vars.

## Try it

From this directory, an agent can run:

```text
/workflow run bugfix --ticket discount-zero-quantity
```

The bundled bugfix workflow should walk through reproduction, root cause, fix planning, DA review, implementation, verification, and docs.

## Intentional failure

`test/discount.test.js` currently contains one failing test by design. The bugfix workflow is meant to diagnose and fix `src/discount.js`.
