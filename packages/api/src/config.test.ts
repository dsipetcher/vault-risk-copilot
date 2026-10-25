import { describe, it, expect } from 'vitest';
import { envSchema, parseSiweChainIds, isCookieSecure } from './config.js';

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

describe('COOKIE_SAMESITE', () => {
  const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  it('defaults to lax', () => {
    expect(envSchema.parse(base).COOKIE_SAMESITE).toBe('lax');
  });

  it('accepts lax, strict, and none', () => {
    expect(envSchema.parse({ ...base, COOKIE_SAMESITE: 'lax' }).COOKIE_SAMESITE).toBe('lax');
    expect(envSchema.parse({ ...base, COOKIE_SAMESITE: 'strict' }).COOKIE_SAMESITE).toBe('strict');
    expect(envSchema.parse({ ...base, COOKIE_SAMESITE: 'none' }).COOKIE_SAMESITE).toBe('none');
  });

  it('rejects unknown values', () => {
    expect(() => envSchema.parse({ ...base, COOKIE_SAMESITE: 'invalid' })).toThrow();
  });

  it('forces Secure when SameSite is none', () => {
    expect(isCookieSecure('development', 'none')).toBe(true);
    expect(isCookieSecure('test', 'none')).toBe(true);
    expect(isCookieSecure('production', 'lax')).toBe(true);
    expect(isCookieSecure('development', 'lax')).toBe(false);
    expect(isCookieSecure('development', 'strict')).toBe(false);
  });
});

describe('SIWE_URI comma-separated list', () => {
  const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  it('accepts a single URL', () => {
    const result = envSchema.parse({ ...base, SIWE_URI: 'http://localhost:5173' });
    expect(result.SIWE_URI).toBe('http://localhost:5173');
  });

  it('accepts a comma-separated list of URLs', () => {
    const result = envSchema.parse({
      ...base,
      SIWE_URI: 'http://localhost:5173, https://user.github.io/vault-risk-copilot/',
    });
    expect(result.SIWE_URI).toBe('http://localhost:5173, https://user.github.io/vault-risk-copilot/');
  });

  it('rejects a list that contains an invalid URL', () => {
    expect(() =>
      envSchema.parse({ ...base, SIWE_URI: 'http://localhost:5173,not-a-url' })
    ).toThrow(/SIWE_URI/);
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
