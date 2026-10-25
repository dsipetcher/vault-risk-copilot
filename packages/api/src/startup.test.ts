import { describe, it, expect } from 'vitest';

describe('Startup Validation', () => {
  it('should require SIWE config in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDomain = process.env.SIWE_DOMAIN;
    const originalUri = process.env.SIWE_URI;
    const originalChainId = process.env.SIWE_CHAIN_ID;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SIWE_DOMAIN;
      delete process.env.SIWE_URI;
      delete process.env.SIWE_CHAIN_ID;
      process.env.LLM_KEY_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      const { build } = await import('../index.js');
      
      await expect(build()).rejects.toThrow('SIWE_DOMAIN, SIWE_URI, and SIWE_CHAIN_ID are required in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDomain) process.env.SIWE_DOMAIN = originalDomain;
      if (originalUri) process.env.SIWE_URI = originalUri;
      if (originalChainId) process.env.SIWE_CHAIN_ID = originalChainId;
    }
  });

  it('should require encryption key in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.LLM_KEY_ENCRYPTION_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.LLM_KEY_ENCRYPTION_KEY;
      process.env.SIWE_DOMAIN = 'example.com';
      process.env.SIWE_URI = 'https://example.com';
      process.env.SIWE_CHAIN_ID = '1';

      const { build } = await import('../index.js');
      
      await expect(build()).rejects.toThrow('LLM_KEY_ENCRYPTION_KEY is required in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey) process.env.LLM_KEY_ENCRYPTION_KEY = originalKey;
    }
  });
});
