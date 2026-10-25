import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Startup Validation', () => {
  let originalEnv: string | undefined;
  let originalDomain: string | undefined;
  let originalUri: string | undefined;
  let originalChainId: string | undefined;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalDomain = process.env.SIWE_DOMAIN;
    originalUri = process.env.SIWE_URI;
    originalChainId = process.env.SIWE_CHAIN_ID;
    originalKey = process.env.LLM_KEY_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEnv) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDomain) process.env.SIWE_DOMAIN = originalDomain;
    else delete process.env.SIWE_DOMAIN;
    if (originalUri) process.env.SIWE_URI = originalUri;
    else delete process.env.SIWE_URI;
    if (originalChainId) process.env.SIWE_CHAIN_ID = originalChainId;
    else delete process.env.SIWE_CHAIN_ID;
    if (originalKey) process.env.LLM_KEY_ENCRYPTION_KEY = originalKey;
    else delete process.env.LLM_KEY_ENCRYPTION_KEY;
    
    delete require.cache[require.resolve('./index.js')];
    delete require.cache[require.resolve('./config.js')];
    delete require.cache[require.resolve('./lib/encryption.js')];
  });

  it('should require SIWE config in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SIWE_DOMAIN;
    delete process.env.SIWE_URI;
    delete process.env.SIWE_CHAIN_ID;
    process.env.LLM_KEY_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

    const { build } = await import('./index.js');
    
    await expect(build()).rejects.toThrow('SIWE_DOMAIN, SIWE_URI, and SIWE_CHAIN_ID are required in production');
  });

  it('should require encryption key in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LLM_KEY_ENCRYPTION_KEY;
    process.env.SIWE_DOMAIN = 'example.com';
    process.env.SIWE_URI = 'https://example.com';
    process.env.SIWE_CHAIN_ID = '1';

    const { build } = await import('./index.js');
    
    await expect(build()).rejects.toThrow('LLM_KEY_ENCRYPTION_KEY is required in production');
  });
});
