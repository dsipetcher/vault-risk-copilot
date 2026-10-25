import { describe, it, expect } from 'vitest';
import { validateBaseUrl, redactApiKey, getDefaultBaseUrl } from '../src/factory.js';

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
