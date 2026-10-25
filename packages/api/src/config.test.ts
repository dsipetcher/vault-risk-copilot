import { describe, it, expect } from 'vitest';
import { envSchema, parseSiweChainIds } from './config.js';

describe('Config', () => {
  it('should parse valid environment variables', () => {
    const env = {
      NODE_ENV: 'test' as const,
      PORT: '3000',
      HOST: '0.0.0.0',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      RISK_SERVICE_URL: 'http://localhost:8000',
      CORS_ORIGIN: 'http://localhost:5173',
    };

    const result = envSchema.parse(env);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('test');
  });

  it('should apply defaults', () => {
    const env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    };

    const result = envSchema.parse(env);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('should reject invalid vault address', () => {
    const env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      VAULT_ADDRESS: 'not-an-address',
    };

    expect(() => envSchema.parse(env)).toThrow();
  });
});

describe('parseSiweChainIds', () => {
  it('uses the comma-separated list when provided', () => {
    expect(parseSiweChainIds('31337,11155111', 1)).toEqual([31337, 11155111]);
  });

  it('falls back to a single SIWE_CHAIN_ID', () => {
    expect(parseSiweChainIds(undefined, 1)).toEqual([1]);
  });

  it('defaults to anvil and sepolia', () => {
    expect(parseSiweChainIds()).toEqual([31337, 11155111]);
  });
});
