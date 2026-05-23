import { readFileSync } from "node:fs";

function readStdin() {
  const chunks = [];
  let chunk;
  while ((chunk = readFileSync(0, "utf8")) !== undefined) {
    chunks.push(chunk);
    break;
  }
  return chunks.join("").trim();
}

export function loadPayloadFromCli() {
  const arg = process.argv[2]?.trim();
  const raw = arg && arg.length > 0 ? arg : readStdin();

  if (!raw) {
    throw new Error("expected a JSON payload as argv[2] or stdin");
  }

  return JSON.parse(raw);
}

export function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("payload must be a JSON object");
  }

  if (!payload.type || typeof payload.type !== "string") {
    throw new Error("payload.type is required");
  }

  if (!Array.isArray(payload.options) || payload.options.length === 0) {
    throw new Error("payload.options must be a non-empty array");
  }

  if (!payload.prompt || typeof payload.prompt !== "string") {
    throw new Error("payload.prompt is required");
  }

  return payload;
}

export function renderTextFallback(payload, { harness, primitive }) {
  const lines = [
    `[${harness}] ${payload.type}`,
    payload.prompt,
    "",
    `Suggested host primitive: ${primitive}`,
    "",
    "Options:",
    ...payload.options.map((option, index) => `${index + 1}. ${option}`),
  ];

  if (payload.after_phase) {
    lines.splice(1, 0, `After phase: ${payload.after_phase}`);
  }

  if (Array.isArray(payload.candidates) && payload.candidates.length > 0) {
    lines.push("", "Promotion candidates:");
    for (const candidate of payload.candidates) {
      lines.push(`- ${candidate.id}: ${candidate.content}`);
    }
  }

  return lines.join("\n");
}

export function printRenderedPrompt(text) {
  process.stdout.write(`${text}\n`);
}
