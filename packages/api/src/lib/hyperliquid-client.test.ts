import { describe, expect, it, vi } from 'vitest';
import {
  HyperliquidClient,
  HyperliquidError,
  backoffWaitMs,
  resolveHyperliquidBaseUrl,
} from './hyperliquid-client.js';

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

describe('HyperliquidClient (API)', () => {
  it('allowlists official hosts and blocks SSRF targets', () => {
    expect(resolveHyperliquidBaseUrl('https://api.hyperliquid.xyz')).toBe('https://api.hyperliquid.xyz');
    expect(() => resolveHyperliquidBaseUrl('http://169.254.169.254/')).toThrow();
  });

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
    expect(backoffWaitMs(0, null, 30_000)).toBe(1000);
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
});
