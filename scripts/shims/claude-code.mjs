#!/usr/bin/env node

import {
  loadPayloadFromCli,
  printRenderedPrompt,
  renderTextFallback,
  validatePayload,
} from "./_shared.mjs";

export function renderClaudeCodePrompt(payload) {
  const validated = validatePayload(payload);
  return renderTextFallback(validated, {
    harness: "claude-code",
    primitive: "AskUserQuestion",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printRenderedPrompt(renderClaudeCodePrompt(loadPayloadFromCli()));
}
