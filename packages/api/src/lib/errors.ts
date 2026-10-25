export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function statusForLlmConfigError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  if (error.name === 'InvalidKeyError') return 401;
  const msg = error.message;
  if (msg.startsWith('API key is required')) return 400;
  if (msg.startsWith('Invalid base URL')) return 400;
  if (msg.startsWith('Unknown provider')) return 400;
  if (msg.toLowerCase().includes('invalid api key')) return 401;
  return null;
}
