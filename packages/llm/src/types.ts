import type { RiskInput, ExplanationOutput } from './schemas.js';

export interface LLMProvider {
  generate(input: RiskInput): Promise<{
    output: ExplanationOutput;
    metadata: {
      model: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      latencyMs: number;
      costUsd?: number;
      fallback?: boolean;
      fallback_reason?: string;
    };
  }>;
}

export interface LLMConfig {
  provider: 'openai' | 'openrouter' | 'groq' | 'ollama' | 'mock';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const ALLOWED_BASE_URLS = [
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://api.groq.com',
] as const;

export const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
