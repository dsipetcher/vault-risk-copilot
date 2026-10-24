import type { LLMSettings, LLMProvider } from '@/types/api';

const SESSION_KEY = 'llm-settings';
const LOCAL_KEY = 'llm-settings-persistent';

const DEFAULT_SETTINGS: LLMSettings = {
  provider: 'mock',
  rememberKey: false,
};

export function getLLMSettings(): LLMSettings {
  // Try localStorage first (if user opted in)
  const localData = localStorage.getItem(LOCAL_KEY);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      return { ...DEFAULT_SETTINGS, ...parsed, rememberKey: true };
    } catch {
      // Invalid data, clear it
      localStorage.removeItem(LOCAL_KEY);
    }
  }

  // Then try sessionStorage
  const sessionData = sessionStorage.getItem(SESSION_KEY);
  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData);
      return { ...DEFAULT_SETTINGS, ...parsed, rememberKey: false };
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  return DEFAULT_SETTINGS;
}

export function saveLLMSettings(settings: LLMSettings): void {
  const dataToStore = {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  };

  if (settings.rememberKey) {
    // Save to localStorage
    localStorage.setItem(LOCAL_KEY, JSON.stringify(dataToStore));
    // Clear sessionStorage
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    // Save to sessionStorage
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(dataToStore));
    // Clear localStorage
    localStorage.removeItem(LOCAL_KEY);
  }
}

export function clearLLMSettings(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
}

export function getDefaultModelForProvider(provider: LLMProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'groq':
      return 'openai/gpt-oss-120b';
    case 'ollama':
      return 'llama3.2';
    case 'mock':
    default:
      return 'mock-v1';
  }
}

export function getDefaultBaseUrlForProvider(provider: LLMProvider): string | undefined {
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
    default:
      return undefined;
  }
}

export function providerRequiresApiKey(provider: LLMProvider): boolean {
  return provider !== 'mock';
}
