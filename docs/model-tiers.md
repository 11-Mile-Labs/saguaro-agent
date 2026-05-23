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
    standard: claude-sonnet-4-6
    deep: claude-opus-4-7
    surgeon: claude-opus-4-7-extended-thinking
  codex:
    standard: gpt-5-codex-medium
    deep: gpt-5-codex-high
    surgeon: gpt-5-codex-pro
  gemini:
    standard: gemini-2.5-flash
    deep: gemini-2.5-pro
    surgeon: gemini-2.5-pro-thinking
```

## Why The Indirection Helps

- workflows stay portable across harnesses
- projects can change model providers without rewriting workflow YAML
- teams can tune cost and depth locally

## Runtime Rule

If a workflow phase asks for a tier that the current harness has not mapped, the runtime should fail clearly rather than silently selecting an unrelated model.
