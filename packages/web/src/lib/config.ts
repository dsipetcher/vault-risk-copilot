const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * fetch wrapper for API calls. Adds `ngrok-skip-browser-warning` so a free ngrok
 * tunnel returns the API response instead of its HTML interstitial. The header is
 * harmless for any other backend.
 */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('ngrok-skip-browser-warning', '1');
  return fetch(input, { ...init, headers });
}

export { API_BASE_URL };
