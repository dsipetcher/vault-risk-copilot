import { afterEach, describe, expect, it, vi } from 'vitest';
import { recomputeRisk } from './risk.js';

describe('recomputeRisk client contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs /recompute with pool_ids instead of /risk/recompute/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        computed: 1,
        skipped: 0,
        errors: 0,
        pool_ids: ['11111111-1111-1111-1111-111111111111'],
        elapsed_seconds: 0.1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await recomputeRisk('11111111-1111-1111-1111-111111111111', true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/recompute$/);
    expect(url).not.toContain('/risk/recompute/');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      pool_ids: ['11111111-1111-1111-1111-111111111111'],
      force: true,
    });
    expect(result.status).toBe('success');
    expect(result.pool_id).toBe('11111111-1111-1111-1111-111111111111');
  });
});
