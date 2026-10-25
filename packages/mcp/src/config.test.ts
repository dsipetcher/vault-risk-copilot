import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const KEYS = [
  'API_BASE_URL',
  'X_LLM_API_KEY',
  'X_LLM_PROVIDER',
  'X_LLM_MODEL',
  'HTTP_HOST',
  'REQUEST_TIMEOUT_MS',
  'EXPLAIN_TIMEOUT_MS',
] as const;
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

  it('defaults HTTP bind to 127.0.0.1 so IPv4 loopback works', () => {
    snapshotEnv();
    process.env.API_BASE_URL = 'http://localhost:3000';
    delete process.env.X_LLM_API_KEY;
    delete process.env.X_LLM_PROVIDER;
    delete process.env.HTTP_HOST;
    const config = loadConfig();
    expect(config.httpHost).toBe('127.0.0.1');
  });

  it('defaults explain timeout above the API backoff and honors EXPLAIN_TIMEOUT_MS', () => {
    snapshotEnv();
    process.env.API_BASE_URL = 'http://localhost:3000';
    delete process.env.X_LLM_API_KEY;
    delete process.env.X_LLM_PROVIDER;
    delete process.env.REQUEST_TIMEOUT_MS;
    delete process.env.EXPLAIN_TIMEOUT_MS;
    const defaults = loadConfig();
    expect(defaults.requestTimeoutMs).toBe(30_000);
    expect(defaults.explainTimeoutMs).toBe(45_000);
    expect(defaults.explainTimeoutMs).toBeGreaterThan(defaults.requestTimeoutMs);

    process.env.EXPLAIN_TIMEOUT_MS = '60000';
    const overridden = loadConfig();
    expect(overridden.explainTimeoutMs).toBe(60_000);
  });
});
