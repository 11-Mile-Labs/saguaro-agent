# The 1% Rule

Saguaro is opinionated about context retrieval.

If there is even a 1% chance that prior memory or prior knowledge might help with the current task, the agent should query it before starting fresh work. The cost of one extra retrieval is low. The cost of rebuilding lost context, repeating a mistake, or contradicting a prior decision is not.

## What The Rule Means

- Use `memory_retrieve` before new work when earlier lessons or outcomes may exist.
- Use `knowledge_search` or `knowledge_query` before new research when specs, docs, or decision records may already exist.
- Treat uncertainty as a reason to query, not as a reason to skip.

## Where Saguaro Enforces It

1. **Tool descriptions** describe memory and knowledge as the default first step when prior context might exist.
2. **Workflow contracts** can set `requires_memory_query: true` or `requires_knowledge_query: true`.
3. **Dispatch validation** checks whether required Saguaro tool calls happened before a phase can pass.

## Why It Exists

AI coding sessions are cheap to start and easy to forget. Saguaro exists to make useful context accumulate rather than disappear. The 1% rule is the habit that makes that accumulation real.
