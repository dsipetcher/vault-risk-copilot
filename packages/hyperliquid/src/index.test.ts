import { describe, expect, it, vi } from 'vitest';
import {
  HyperliquidClient,
  HyperliquidError,
  backoffWaitMs,
  parseRetryAfterMs,
  readJsonWithSignal,
  resolveHyperliquidBaseUrl,
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_PER_WAIT_CAP_MS,
} from './index.js';

const recordedMeta = [
  {
    universe: [
      { szDecimals: 5, name: 'BTC', maxLeverage: 40 },
      { szDecimals: 4, name: 'ETH', maxLeverage: 25, isDelisted: false },
    ],
  },
  [
    {
      funding: '0.0000125',
      openInterest: '10',
      prevDayPx: '100',
      dayNtlVlm: '1000',
      premium: '0.0001',
      oraclePx: '100',
      markPx: '101',
      midPx: '100.5',
      impactPxs: ['100', '102'],
      dayBaseVlm: '5',
    },
    {
      funding: '0.0',
      openInterest: '0',
      prevDayPx: '1',
      dayNtlVlm: '0',
      premium: null,
      oraclePx: '1',
      markPx: '1',
      midPx: null,
      impactPxs: null,
    },
  ],
];

const recordedFunding = [
  { coin: 'ETH', fundingRate: '0.0000125', premium: '-0.0001', time: 1700000000000 },
];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('resolveHyperliquidBaseUrl', () => {
  it('allowlists official hosts and blocks SSRF targets', () => {
    expect(resolveHyperliquidBaseUrl('https://api.hyperliquid.xyz')).toBe('https://api.hyperliquid.xyz');
    expect(resolveHyperliquidBaseUrl('https://api.hyperliquid-testnet.xyz/info')).toBe(
      'https://api.hyperliquid-testnet.xyz'
    );
    expect(resolveHyperliquidBaseUrl('http://127.0.0.1:9')).toBe('http://127.0.0.1:9');
    expect(() => resolveHyperliquidBaseUrl('https://evil.example')).toThrow(/allowlisted/);
    expect(() => resolveHyperliquidBaseUrl('http://169.254.169.254/')).toThrow(/https/);
  });
});

describe('backoffWaitMs', () => {
  it('honors Retry-After and exponential fallback', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('60')).toBe(RATE_LIMIT_PER_WAIT_CAP_MS);
    expect(backoffWaitMs(0, '2', 30_000)).toBe(2000);
    expect(backoffWaitMs(0, null, 30_000)).toBe(RATE_LIMIT_DEFAULT_WAIT_MS);
    expect(backoffWaitMs(1, null, 30_000)).toBe(2000);
  });
});

describe('HyperliquidClient', () => {
  it('parses recorded metaAndAssetCtxs without a network call', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordedMeta));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const rows = await client.fetchPerpSnapshots(new Date('2026-11-03T00:00:00Z'));
    expect(rows).toHaveLength(2);
    expect(rows[0].coin).toBe('BTC');
    expect(rows[0].funding_rate).toBeCloseTo(0.0000125);
    expect(rows[1].premium).toBeNull();
  });

  it('parses recorded fundingHistory', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordedFunding));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const rows = await client.fetchFundingHistory('ETH', 1);
    expect(rows[0].funding_rate).toBeCloseTo(0.0000125);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).type).toBe('fundingHistory');
  });

  it('backs off on 429 then succeeds', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(recordedFunding));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
    });
    await client.fetchFundingHistory('ETH', 1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('throws HyperliquidError after repeated 429s', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
    });
    await expect(client.fetchFundingHistory('ETH', 1)).rejects.toBeInstanceOf(HyperliquidError);
  });

  it('times out via AbortSignal during fetch', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      if (init?.signal?.aborted) throw err;
      throw err;
    });
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.fetchPerpSnapshots()).rejects.toThrow(/timed out/);
  });

  it('times out while reading the response body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => {
          await new Promise<void>((_resolve, reject) => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            if (init?.signal?.aborted) {
              reject(err);
              return;
            }
            init?.signal?.addEventListener('abort', () => reject(err), { once: true });
          });
        },
      } as unknown as Response;
    });
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      timeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.fetchPerpSnapshots()).rejects.toThrow(/timed out/);
  });
});

describe('readJsonWithSignal', () => {
  it('aborts a hanging body read when the signal fires', async () => {
    const signal = AbortSignal.timeout(15);
    const response = {
      json: async () => new Promise(() => undefined),
    } as unknown as Response;
    await expect(readJsonWithSignal(response, signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
