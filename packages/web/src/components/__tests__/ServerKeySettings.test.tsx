import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerKeySettings } from '../ServerKeySettings';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

describe('ServerKeySettings delete', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for confirmation then DELETEs the stored credential', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/llm-credentials') && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            credentials: [{ provider: 'groq', maskedKey: 'gsk-...abcd' }],
          }),
        } as Response;
      }
      if (url.includes('/api/llm-credentials') && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ServerKeySettings onClose={vi.fn()} />);

    expect(await screen.findByTestId('stored-key-groq')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('delete-key-groq'));
    expect(screen.getByTestId('confirm-delete-groq')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm-delete-groq'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/llm-credentials?provider=groq'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
