# Next.js Engineering Demo

This example is a compact App Router project sized for the bundled `engineering` workflow.

## What is here

- `app/page.tsx` renders a small product search page.
- `app/api/search/route.ts` returns mock results.
- `.saguaro/config.yaml` is ready for project-local workflow runs.

## Try it

```text
/workflow run engineering --ticket improve-search-empty-state
```

The example is intentionally tiny, but it has enough surface area for research, architecture, implementation, review, and docs phases.
