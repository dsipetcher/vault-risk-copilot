import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load valid configuration', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.MAINNET_RPC_URL = 'https://eth.llamarpc.com';

    const config = loadConfig();

    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/test');
    expect(config.MAINNET_RPC_URL).toBe('https://eth.llamarpc.com');
    expect(config.COLLECTION_INTERVAL_MS).toBe(300000);
  });

  it('should apply defaults for optional fields', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.DEFILLAMA_API_URL).toBe('https://yields.llama.fi');
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('should throw on missing required fields', () => {
    delete process.env.DATABASE_URL;

    expect(() => loadConfig()).toThrow('Configuration validation failed');
  });

  it('should throw on invalid DATABASE_URL format', () => {
    process.env.DATABASE_URL = 'not-a-url';

    expect(() => loadConfig()).toThrow();
  });

  it('should coerce COLLECTION_INTERVAL_MS to number', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.COLLECTION_INTERVAL_MS = '60000';

    const config = loadConfig();

    expect(config.COLLECTION_INTERVAL_MS).toBe(60000);
    expect(typeof config.COLLECTION_INTERVAL_MS).toBe('number');
  });
});
