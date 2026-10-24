import type { LLMProvider, LLMConfig } from './types.js';
import { ALLOWED_BASE_URLS, LOCALHOST_PATTERN } from './types.js';
import { MockProvider } from './providers/mock.js';
import { OpenAIProvider } from './providers/openai.js';

export function createProvider(config: LLMConfig): LLMProvider {
  if (config.provider === 'mock') {
    return new MockProvider();
  }

  if (!config.apiKey) {
    throw new Error(`API key is required for provider: ${config.provider}`);
  }

  if (config.baseUrl) {
    validateBaseUrl(config.baseUrl);
  }

  const providerBaseUrl = config.baseUrl ?? getDefaultBaseUrl(config.provider);

  return new OpenAIProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: providerBaseUrl,
  });
}

export function validateBaseUrl(baseUrl: string): void {
  const isDev = process.env.NODE_ENV === 'development';

  const isAllowed = ALLOWED_BASE_URLS.some((allowed) => baseUrl.startsWith(allowed));
  const isLocalhost = LOCALHOST_PATTERN.test(baseUrl);

  if (!isAllowed && !(isDev && isLocalhost)) {
    throw new Error(
      `Invalid base URL: ${baseUrl}. Only allowed providers and localhost (dev only) are permitted.`
    );
  }
}

export function getDefaultBaseUrl(provider: LLMConfig['provider']): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'mock':
      return '';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getConfigFromEnv(): LLMConfig {
  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL;
  const baseUrl = process.env.LLM_BASE_URL;
  const provider = (process.env.LLM_PROVIDER as LLMConfig['provider']) ?? 'openai';

  if (!apiKey) {
    return { provider: 'mock' };
  }

  return {
    provider,
    apiKey,
    model: modelName,
    baseUrl,
  };
}

export function redactApiKey(key: string | undefined): string {
  if (!key || key.length < 8) {
    return '[REDACTED]';
  }
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}
