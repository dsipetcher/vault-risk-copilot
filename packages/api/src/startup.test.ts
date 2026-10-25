import { describe, it, expect } from 'vitest';
import { env } from './config.js';

describe('Startup Validation', () => {
  it('should have SIWE_DOMAIN configured for tests', () => {
    expect(env.SIWE_DOMAIN).toBeDefined();
    expect(env.SIWE_URI).toBeDefined();
    expect(env.SIWE_CHAIN_ID).toBeDefined();
  });

  it('should have encryption key configured for tests', () => {
    expect(env.LLM_KEY_ENCRYPTION_KEY).toBeDefined();
  });
});
