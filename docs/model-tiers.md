# Model Tiers

Saguaro keeps workflow definitions portable by separating logical intent from harness-specific model names.

## Logical Tiers

- `standard`
- `deep`
- `surgeon`

A workflow chooses a logical tier. The project-local config decides what that means for Claude Code, Codex, or Gemini CLI.

## Example Mapping

```yaml
model_tiers:
  claude:
    standard: claude-standard-model
    deep: claude-deep-model
    surgeon: claude-high-reasoning-model
  codex:
    standard: codex-standard-model
    deep: codex-deep-model
    surgeon: codex-high-reasoning-model
  gemini:
    standard: gemini-standard-model
    deep: gemini-deep-model
    surgeon: gemini-high-reasoning-model
```

## Why The Indirection Helps

- workflows stay portable across harnesses
- projects can change model providers without rewriting workflow YAML
- teams can tune cost and depth locally

## Runtime Rule

If a workflow phase asks for a tier that the current harness has not mapped, the runtime should fail clearly rather than silently selecting an unrelated model.
