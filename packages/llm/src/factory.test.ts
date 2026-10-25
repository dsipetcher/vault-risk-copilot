import { describe, it, expect } from 'vitest';
import { validateBaseUrl, redactApiKey, getDefaultBaseUrl, createProvider, getDefaultModel } from '../src/factory.js';

describe('validateBaseUrl', () => {
  const originalEnv = process.env.NODE_ENV;

  it('should allow OpenAI base URL', () => {
    expect(() => validateBaseUrl('https://api.openai.com/v1')).not.toThrow();
  });

  it('should allow OpenRouter base URL', () => {
    expect(() => validateBaseUrl('https://openrouter.ai/api/v1')).not.toThrow();
  });

  it('should allow Groq base URL', () => {
    expect(() => validateBaseUrl('https://api.groq.com/openai/v1')).not.toThrow();
  });

  it('should reject arbitrary URL in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('https://evil.com/api')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should reject http://localhost in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://localhost:11434')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should allow http://localhost in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateBaseUrl('http://localhost:11434')).not.toThrow();
    expect(() => validateBaseUrl('http://127.0.0.1:8080')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should reject SSRF attempts', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://169.254.169.254/metadata')).toThrow();
    expect(() => validateBaseUrl('http://internal-service.local')).toThrow();
    process.env.NODE_ENV = originalEnv;
  });
});

describe('redactApiKey', () => {
  it('should redact long API keys', () => {
    const key = 'sk-1234567890abcdefghijklmnop';
    const redacted = redactApiKey(key);
    expect(redacted).toBe('sk-1...mnop');
    expect(redacted).not.toContain('567890');
  });

  it('should fully redact short keys', () => {
    expect(redactApiKey('short')).toBe('[REDACTED]');
    expect(redactApiKey('abc')).toBe('[REDACTED]');
  });

  it('should handle undefined', () => {
    expect(redactApiKey(undefined)).toBe('[REDACTED]');
  });

  it('should handle empty string', () => {
    expect(redactApiKey('')).toBe('[REDACTED]');
  });
});

describe('getDefaultBaseUrl', () => {
  it('should return correct default URLs', () => {
    expect(getDefaultBaseUrl('openai')).toBe('https://api.openai.com/v1');
    expect(getDefaultBaseUrl('openrouter')).toBe('https://openrouter.ai/api/v1');
    expect(getDefaultBaseUrl('groq')).toBe('https://api.groq.com/openai/v1');
    expect(getDefaultBaseUrl('ollama')).toBe('http://localhost:11434/v1');
  });

  it('should throw for mock provider', () => {
    expect(getDefaultBaseUrl('mock')).toBe('');
  });
});

describe('getDefaultModel', () => {
  it('returns a per-provider default so Groq never falls back to an OpenAI model id', () => {
    expect(getDefaultModel('groq')).toBe('openai/gpt-oss-120b');
    expect(getDefaultModel('openai')).toBe('gpt-4o-mini');
    expect(getDefaultModel('openrouter')).toBe('openai/gpt-4o-mini');
    expect(getDefaultModel('ollama')).toBe('llama3.2');
    expect(getDefaultModel('mock')).toBe('mock-v1');
  });
});

describe('createProvider default models', () => {
  it('uses the Groq default model when none is provided', () => {
    const provider = createProvider({ provider: 'groq', apiKey: 'gsk-test' });
    expect((provider as { model?: string }).model ?? (provider as unknown as { model: string }).model).toBeDefined();
    // OpenAIProvider stores model privately; generate fallback metadata uses it.
    // Inspect via a type-narrowed read of the constructed instance.
    expect(Reflect.get(provider, 'model')).toBe('openai/gpt-oss-120b');
  });

  it('uses the OpenAI default model when none is provided', () => {
    const provider = createProvider({ provider: 'openai', apiKey: 'sk-test' });
    expect(Reflect.get(provider, 'model')).toBe('gpt-4o-mini');
  });

  it('uses the Ollama default model when none is provided', () => {
    const provider = createProvider({ provider: 'ollama', apiKey: 'local' });
    expect(Reflect.get(provider, 'model')).toBe('llama3.2');
  });

  it('keeps an explicit model', () => {
    const provider = createProvider({ provider: 'groq', apiKey: 'gsk-test', model: 'llama-3.3-70b-versatile' });
    expect(Reflect.get(provider, 'model')).toBe('llama-3.3-70b-versatile');
  });
});
