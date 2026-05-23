import type { StorageRuntime } from "./types.js";

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export interface SaguaroEmbeddingsClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

type EmbeddingsClientFactory = (runtime: StorageRuntime) => SaguaroEmbeddingsClient;

let testEmbeddingsClientFactory: EmbeddingsClientFactory | undefined;

export function setEmbeddingsClientFactoryForTests(factory: EmbeddingsClientFactory | undefined): void {
  testEmbeddingsClientFactory = factory;
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

export function createEmbeddingsClient(runtime: StorageRuntime): SaguaroEmbeddingsClient {
  if (testEmbeddingsClientFactory) {
    return testEmbeddingsClientFactory(runtime);
  }

  const config = runtime.config.embeddings ?? {};
  const baseUrl = requireValue(
    config.base_url ?? config.url ?? process.env.SAGUARO_EMBEDDINGS_BASE_URL ?? process.env.EMBEDDINGS_BASE_URL,
    "Saguaro embeddings require embeddings.base_url or SAGUARO_EMBEDDINGS_BASE_URL.",
  );
  const model = requireValue(
    config.model ?? process.env.SAGUARO_EMBEDDINGS_MODEL ?? process.env.EMBEDDINGS_MODEL,
    "Saguaro embeddings require embeddings.model or SAGUARO_EMBEDDINGS_MODEL.",
  );
  const apiKey = envValue(config.api_key_env) ?? process.env.SAGUARO_EMBEDDINGS_API_KEY ?? process.env.EMBEDDINGS_API_KEY;

  async function requestEmbeddings(input: string | string[]): Promise<number[][]> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input }),
    });

    if (!response.ok) {
      throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;
    return data.data.map((item) => item.embedding);
  }

  return {
    async embed(text) {
      const [embedding] = await requestEmbeddings(text);
      if (!embedding) {
        throw new Error("Embedding provider returned no embedding.");
      }
      return embedding;
    },
    async embedBatch(texts) {
      if (texts.length === 0) {
        return [];
      }
      return requestEmbeddings(texts);
    },
  };
}
