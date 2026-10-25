import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const KEYS = ['API_BASE_URL', 'X_LLM_API_KEY', 'X_LLM_PROVIDER', 'X_LLM_MODEL'] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function snapshotEnv() {
  for (const key of KEYS) saved[key] = process.env[key];
}

describe('loadConfig', () => {
  it('requires API_BASE_URL', () => {
    snapshotEnv();
    delete process.env.API_BASE_URL;
    delete process.env.X_LLM_API_KEY;
    delete process.env.X_LLM_PROVIDER;
    expect(() => loadConfig()).toThrow();
  });

  it('refuses a BYOK key without X_LLM_PROVIDER', () => {
    snapshotEnv();
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.X_LLM_API_KEY = 'gsk-test';
    delete process.env.X_LLM_PROVIDER;
    expect(() => loadConfig()).toThrow(/X_LLM_PROVIDER/);
  });

  it('accepts a Groq key when provider is set', () => {
    snapshotEnv();
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.X_LLM_API_KEY = 'gsk-test';
    process.env.X_LLM_PROVIDER = 'groq';
    process.env.X_LLM_MODEL = 'openai/gpt-oss-120b';
    const config = loadConfig();
    expect(config.llmProvider).toBe('groq');
    expect(config.llmModel).toBe('openai/gpt-oss-120b');
  });
});
