#!/usr/bin/env node
import assert from "node:assert/strict";
import { renderClaudeCodePrompt } from "./shims/claude-code.mjs";
import { renderCodexPrompt } from "./shims/codex.mjs";
import { renderGeminiPrompt } from "./shims/gemini.mjs";

const approvalPayload = {
  type: "approval_gate",
  after_phase: "da",
  prompt: "Approve the implementation plan?",
  options: ["approve", "request_changes", "abort"],
};

const promotionPayload = {
  type: "memory_promotion",
  prompt: "Promote useful run memories?",
  options: ["promote", "skip"],
  candidates: [{ id: "mem_123", content: "Prefer durable project notes for repeated decisions." }],
};

for (const [name, render] of [
  ["claude-code", renderClaudeCodePrompt],
  ["codex", renderCodexPrompt],
  ["gemini", renderGeminiPrompt],
]) {
  const approval = render(approvalPayload);
  assert.match(approval, new RegExp(name));
  assert.match(approval, /Approve the implementation plan/);
  assert.match(approval, /Options:/);

  const promotion = render(promotionPayload);
  assert.match(promotion, /Promotion candidates:/);
  assert.match(promotion, /mem_123/);
  console.log(`ok ${name} shims`);
}
