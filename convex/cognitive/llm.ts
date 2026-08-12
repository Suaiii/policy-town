import {
  chatCompletion,
  fetchEmbeddingBatch,
  LLMMessage,
} from '../util/llm';

export type { LLMMessage };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  // Ask the provider for a JSON object response (not all providers support this).
  json?: boolean;
}

/**
 * Thin LLM abstraction for the cognitive module. The default implementation
 * delegates to the project's existing provider-agnostic client
 * (convex/util/llm.ts), which supports OpenAI / Together / Ollama / custom.
 */
export interface LLMService {
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}

export class DefaultLLMService implements LLMService {
  async chat(messages: LLMMessage[], options: ChatOptions = {}): Promise<string> {
    const body = {
      messages,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.stop ? { stop: options.stop } : {}),
      ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
    };
    const result = (await chatCompletion(body)) as { content: string };
    return result.content;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { embeddings } = await fetchEmbeddingBatch(texts);
    return embeddings;
  }
}

/** Deterministic LLM double for unit tests. */
export class StubLLMService implements LLMService {
  constructor(
    private readonly chatHandler: (
      messages: LLMMessage[],
      options?: ChatOptions,
    ) => string | Promise<string>,
    private readonly embedHandler?: (texts: string[]) => number[][] | Promise<number[][]>,
  ) {}

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<string> {
    return await this.chatHandler(messages, options);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.embedHandler) {
      return await this.embedHandler(texts);
    }
    // Dummy deterministic embeddings: token-ish hashes so identical texts
    // get identical vectors and similar texts get similar vectors.
    return texts.map((text) => {
      const vec = new Array<number>(8).fill(0);
      for (let i = 0; i < text.length; i++) {
        vec[text.charCodeAt(i) % 8] += 1;
      }
      const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
      return vec.map((v) => v / norm);
    });
  }
}

/** Parse a bare number (e.g. poignancy "5") from an LLM response. */
export function parseNumberFromResponse(raw: string): number | null {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const match = trimmed.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Parse JSON, tolerating stray prose around the object. */
export function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
