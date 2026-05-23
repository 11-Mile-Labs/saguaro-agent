#!/usr/bin/env node
async function checkJson(label, url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      return { label, ok: false, detail: `${response.status} ${await response.text()}` };
    }
    return { label, ok: true };
  } catch (error) {
    return { label, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

const embeddingsUrl = process.env.SAGUARO_EMBEDDINGS_BASE_URL ?? process.env.EMBEDDINGS_BASE_URL;
const llmUrl = process.env.SAGUARO_LLM_BASE_URL ?? process.env.LLM_BASE_URL;
const authHeaders = (token) => token ? { Authorization: `Bearer ${token}` } : {};

const checks = [
  embeddingsUrl
    ? await checkJson("Embeddings", `${embeddingsUrl.replace(/\/$/, "")}/models`, {
        headers: authHeaders(process.env.SAGUARO_EMBEDDINGS_API_KEY ?? process.env.EMBEDDINGS_API_KEY),
      })
    : { label: "Embeddings", ok: false, detail: "Set EMBEDDINGS_BASE_URL." },
  llmUrl
    ? await checkJson("OpenAI-compatible chat", `${llmUrl.replace(/\/$/, "")}/models`, {
        headers: authHeaders(process.env.SAGUARO_LLM_API_KEY ?? process.env.LLM_API_KEY),
      })
    : { label: "OpenAI-compatible chat", ok: false, detail: "Set LLM_BASE_URL." },
];

for (const check of checks) {
  console.log(`${check.ok ? "ok" : "fail"} ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
}

process.exit(checks.every((check) => check.ok) ? 0 : 1);
