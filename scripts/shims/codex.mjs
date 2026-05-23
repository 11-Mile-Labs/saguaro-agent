#!/usr/bin/env node

import {
  loadPayloadFromCli,
  printRenderedPrompt,
  renderTextFallback,
  validatePayload,
} from "./_shared.mjs";

export function renderCodexPrompt(payload) {
  const validated = validatePayload(payload);
  return renderTextFallback(validated, {
    harness: "codex",
    primitive: "request_user_input equivalent",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printRenderedPrompt(renderCodexPrompt(loadPayloadFromCli()));
}
