import { randomUUID } from "node:crypto";
import type { KnowledgeChunk } from "./types.js";

const WORD_RE = /[a-z0-9]+/g;

function normalizedWordSet(value: string): Set<string> {
  return new Set((value.toLowerCase().match(WORD_RE) ?? []).filter(Boolean));
}

export function scoreTextMatch(query: string, candidate: string): number {
  const queryWords = normalizedWordSet(query);
  const candidateWords = normalizedWordSet(candidate);

  if (queryWords.size === 0 || candidateWords.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of queryWords) {
    if (candidateWords.has(word)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCandidate = candidate.trim().toLowerCase();
  const phraseBonus = normalizedQuery.length > 0 && normalizedCandidate.includes(normalizedQuery) ? 0.2 : 0;

  return Math.min(1, overlap / Math.sqrt(queryWords.size * candidateWords.size) + phraseBonus);
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function chunkDocument(
  documentId: string,
  content: string,
  chunkSize = 900,
): KnowledgeChunk[] {
  const normalizedChunkSize = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : 900;
  const paragraphs = content
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: KnowledgeChunk[] = [];
  let current = "";

  function pushChunk(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    chunks.push({
      id: `chunk_${randomUUID()}`,
      documentId,
      index: chunks.length,
      content: trimmed,
    });
  }

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [content.trim()]) {
    if (!paragraph) {
      continue;
    }

    if (paragraph.length > normalizedChunkSize) {
      if (current) {
        pushChunk(current);
        current = "";
      }
      for (let start = 0; start < paragraph.length; start += normalizedChunkSize) {
        pushChunk(paragraph.slice(start, start + normalizedChunkSize));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > normalizedChunkSize && current) {
      pushChunk(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  pushChunk(current);
  return chunks.length > 0 ? chunks : [{
    id: `chunk_${randomUUID()}`,
    documentId,
    index: 0,
    content: content.trim(),
  }];
}
