import { describe, expect, it } from 'vitest';
import { HttpError, isHttpError, statusForLlmConfigError } from './errors.js';

describe('LLM config error status mapping', () => {
  it('maps missing API key to 400', () => {
    expect(statusForLlmConfigError(new Error('API key is required for provider: groq'))).toBe(400);
  });

  it('maps blocked base URLs to 400', () => {
    expect(
      statusForLlmConfigError(
        new Error('Invalid base URL: http://169.254.169.254/. Only allowed providers and localhost (dev only) are permitted.')
      )
    ).toBe(400);
    expect(
      statusForLlmConfigError(
        new Error('Invalid base URL: http://10.0.0.1. Only allowed providers and localhost (dev only) are permitted.')
      )
    ).toBe(400);
  });

  it('does not map unrelated errors', () => {
    expect(statusForLlmConfigError(new Error('boom'))).toBeNull();
  });

  it('identifies HttpError', () => {
    const err = new HttpError(404, 'Pool not found');
    expect(isHttpError(err)).toBe(true);
    expect(err.statusCode).toBe(404);
  });
});
