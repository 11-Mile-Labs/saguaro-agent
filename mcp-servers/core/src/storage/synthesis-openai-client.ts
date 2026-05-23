import type { StorageRuntime } from "./types.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface KnowledgeSynthesisInput {
  prompt: string;
  chunks: Array<{
    documentId: string;
    title: string;
    content: string;
    sourceUrl: string | null;
    score: number;
  }>;
}

export interface SaguaroSynthesisClient {
  synthesize(input: KnowledgeSynthesisInput): Promise<string>;
}

type SynthesisClientFactory = (runtime: StorageRuntime) => SaguaroSynthesisClient;

let testSynthesisClientFactory: SynthesisClientFactory | undefined;

export function setSynthesisClientFactoryForTests(factory: SynthesisClientFactory | undefined): void {
  testSynthesisClientFactory = factory;
}

function envValue(name?: string): string | undefined {
  return name ? process.env[name] : undefined;
}

function requireValue(value: string | undefined, message: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.replace(/\/$/, "");
}

export function createOpenAiCompatibleSynthesisClient(runtime: StorageRuntime): SaguaroSynthesisClient {
  if (testSynthesisClientFactory) {
    return testSynthesisClientFactory(runtime);
  }

  const config = runtime.config.llm ?? {};
  const baseUrl = requireValue(
    config.base_url ?? config.url ?? process.env.SAGUARO_LLM_BASE_URL ?? process.env.LLM_BASE_URL,
    "Saguaro knowledge synthesis requires llm.base_url or LLM_BASE_URL.",
  );
  const model = requireValue(
    config.model ?? process.env.SAGUARO_LLM_MODEL ?? process.env.LLM_MODEL,
    "Saguaro knowledge synthesis requires llm.model or LLM_MODEL.",
  );
  const apiKey =
    envValue(config.api_key_env) ?? process.env.SAGUARO_LLM_API_KEY ?? process.env.LLM_API_KEY;
  const temperature = typeof config.temperature === "number" ? config.temperature : 0;

  return {
    async synthesize(input) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const context = input.chunks
        .map((chunk, index) => [
          `Source ${index + 1}: ${chunk.title}`,
          `Document: ${chunk.documentId}`,
          chunk.sourceUrl ? `URL: ${chunk.sourceUrl}` : null,
          chunk.content,
        ].filter(Boolean).join("\n"))
        .join("\n\n---\n\n");

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "Answer from the provided Saguaro knowledge chunks. If the chunks do not answer the question, say what is missing. Cite source titles inline.",
            },
            {
              role: "user",
              content: `Question:\n${input.prompt}\n\nKnowledge chunks:\n${context || "(no chunks retrieved)"}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI-compatible chat request failed (${response.status}): ${await response.text()}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    },
  };
}
