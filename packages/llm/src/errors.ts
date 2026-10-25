export class InvalidKeyError extends Error {
  readonly code = 'invalid_key' as const;

  constructor(message = 'Invalid API key') {
    super(message);
    this.name = 'InvalidKeyError';
  }
}

export function isInvalidKeyError(error: unknown): error is InvalidKeyError {
  return error instanceof InvalidKeyError;
}
