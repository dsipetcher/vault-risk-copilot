import { describe, it, expect } from 'vitest';
import { validateBaseUrl } from '@vault-risk-copilot/llm';

describe('SSRF Protection', () => {
  const originalEnv = process.env.NODE_ENV;

  it('should allow whitelisted OpenAI URL', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('https://api.openai.com/v1')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should allow whitelisted OpenRouter URL', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('https://openrouter.ai/api/v1')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should allow whitelisted Groq URL', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('https://api.groq.com/openai/v1')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should block arbitrary external URL in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('https://evil.com/api')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should block internal metadata service', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://169.254.169.254/metadata')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should block private IP ranges', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://10.0.0.1/api')).toThrow(/Invalid base URL/);
    expect(() => validateBaseUrl('http://192.168.1.1/api')).toThrow(/Invalid base URL/);
    expect(() => validateBaseUrl('http://172.16.0.1/api')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should block localhost in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://localhost:11434')).toThrow(/Invalid base URL/);
    expect(() => validateBaseUrl('http://127.0.0.1:8080')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });

  it('should allow localhost in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateBaseUrl('http://localhost:11434')).not.toThrow();
    expect(() => validateBaseUrl('http://127.0.0.1:8080')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should block file:// protocol', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateBaseUrl('file:///etc/passwd')).toThrow();
    process.env.NODE_ENV = originalEnv;
  });

  it('should block internal .local domains', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateBaseUrl('http://internal-service.local/api')).toThrow(/Invalid base URL/);
    process.env.NODE_ENV = originalEnv;
  });
});
