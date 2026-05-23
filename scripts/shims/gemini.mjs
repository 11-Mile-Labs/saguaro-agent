#!/usr/bin/env node

import {
  loadPayloadFromCli,
  printRenderedPrompt,
  renderTextFallback,
  validatePayload,
} from "./_shared.mjs";

export function renderGeminiPrompt(payload) {
  const validated = validatePayload(payload);
  return renderTextFallback(validated, {
    harness: "gemini-cli",
    primitive: "interactive prompt bridge",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printRenderedPrompt(renderGeminiPrompt(loadPayloadFromCli()));
}
