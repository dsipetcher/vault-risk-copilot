import type { LLMConfig } from './types.js';

export const DEFAULT_MODELS: Record<LLMConfig['provider'], string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  groq: 'openai/gpt-oss-120b',
  ollama: 'llama3.2',
  mock: 'mock-v1',
};

export function getDefaultModel(provider: LLMConfig['provider']): string {
  return DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai;
}

export const MODEL_MAX_LENGTH = 100;
