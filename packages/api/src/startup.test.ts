import { describe, it, expect, beforeAll } from 'vitest';

describe('Startup Validation', () => {
  beforeAll(() => {
    process.env.SIWE_DOMAIN = process.env.SIWE_DOMAIN || 'localhost';
    process.env.SIWE_URI = process.env.SIWE_URI || 'http://localhost:3000';
    process.env.SIWE_CHAIN_ID = process.env.SIWE_CHAIN_ID || '1';
  });
  
  it('should have SIWE_DOMAIN configured for tests', async () => {
    const { env } = await import('./config.js');
    expect(env.SIWE_DOMAIN).toBeDefined();
    expect(env.SIWE_URI).toBeDefined();
    expect(env.SIWE_CHAIN_ID).toBeDefined();
  });

  it('should have encryption key configured for tests', async () => {
    const { env } = await import('./config.js');
    expect(env.LLM_KEY_ENCRYPTION_KEY).toBeDefined();
  });
});
