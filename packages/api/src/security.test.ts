import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redactApiKey } from '@vault-risk-copilot/llm';

describe('API Key Redaction', () => {
  it('should redact API keys in logs', () => {
    const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
    const redacted = redactApiKey(apiKey);

    expect(redacted).not.toContain('1234567890abcdef');
    expect(redacted).toBe('sk-1...wxyz');
  });

  it('should handle short keys', () => {
    const redacted = redactApiKey('short');
    expect(redacted).toBe('[REDACTED]');
  });

  it('should handle undefined keys', () => {
    const redacted = redactApiKey(undefined);
    expect(redacted).toBe('[REDACTED]');
  });

  it('should not expose middle characters', () => {
    const apiKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
    const redacted = redactApiKey(apiKey);

    expect(redacted).not.toContain('abcdefgh');
    expect(redacted).not.toContain('klmnop');
    expect(redacted).not.toContain('1234567');
  });
});

describe('Error Message Redaction', () => {
  it('should redact API keys from error messages', () => {
    const errorMessage = 'API call failed with key sk-1234567890abcdefghijklmnop';
    const redacted = errorMessage.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');

    expect(redacted).not.toContain('sk-1234567890');
    expect(redacted).toContain('[REDACTED]');
  });

  it('should handle multiple keys in message', () => {
    const errorMessage = 'Keys sk-abc123 and sk-def456 failed';
    const redacted = errorMessage.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');

    expect(redacted).toBe('Keys [REDACTED] and [REDACTED] failed');
  });
});
