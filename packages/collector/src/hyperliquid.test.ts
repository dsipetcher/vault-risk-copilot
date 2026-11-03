import { describe, it, expect, vi } from 'vitest';
import {
  HyperliquidClient,
  backoffWaitMs,
  parseRetryAfterMs,
  resolveHyperliquidBaseUrl,
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_PER_WAIT_CAP_MS,
} from './hyperliquid.js';
import { recordedFundingHistory, recordedMetaAndAssetCtxs } from './hyperliquid.fixtures.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('resolveHyperliquidBaseUrl', () => {
  it('allows the official HTTPS hosts', () => {
    expect(resolveHyperliquidBaseUrl('https://api.hyperliquid.xyz')).toBe('https://api.hyperliquid.xyz');
    expect(resolveHyperliquidBaseUrl('https://api.hyperliquid-testnet.xyz/info')).toBe(
      'https://api.hyperliquid-testnet.xyz'
    );
  });

  it('allows loopback for tests', () => {
    expect(resolveHyperliquidBaseUrl('http://127.0.0.1:9')).toBe('http://127.0.0.1:9');
  });

  it('rejects non-allowlisted hosts (SSRF)', () => {
    expect(() => resolveHyperliquidBaseUrl('https://evil.example')).toThrow(/allowlisted/);
    expect(() => resolveHyperliquidBaseUrl('http://169.254.169.254/')).toThrow(/https/);
    expect(() => resolveHyperliquidBaseUrl('http://10.0.0.1/info')).toThrow();
  });
});

describe('backoffWaitMs', () => {
  it('honors Retry-After and exponential fallback like the LLM client', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('60')).toBe(RATE_LIMIT_PER_WAIT_CAP_MS);
    expect(backoffWaitMs(0, '2', 30_000)).toBe(2000);
    expect(backoffWaitMs(0, null, 30_000)).toBe(RATE_LIMIT_DEFAULT_WAIT_MS);
    expect(backoffWaitMs(1, null, 30_000)).toBe(2000);
    expect(backoffWaitMs(2, null, 30_000)).toBe(4000);
  });
});

describe('HyperliquidClient', () => {
  it('parses recorded metaAndAssetCtxs fixtures without hitting the network', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordedMetaAndAssetCtxs));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const snapshotAt = new Date('2026-11-03T00:00:00.000Z');
    const snapshots = await client.fetchPerpSnapshots(snapshotAt);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit?];
    expect(firstCall[1]?.method).toBe('POST');
    expect(JSON.parse(String(firstCall[1]?.body))).toEqual({ type: 'metaAndAssetCtxs' });

    expect(snapshots).toHaveLength(4);
    expect(snapshots[0].coin).toBe('BTC');
    expect(snapshots[0].funding_rate).toBeCloseTo(0.0000125);
    expect(snapshots[0].mark_px).toBe(76786);
    expect(snapshots[0].oracle_px).toBe(76813.5);
    expect(snapshots[0].day_ntl_vlm).toBeGreaterThan(1e9);
    expect(snapshots[3].coin).toBe('HPOS');
    expect(snapshots[3].is_delisted).toBe(true);
    expect(snapshots[3].premium).toBeNull();
    expect(snapshots[3].mid_px).toBeNull();
    expect(snapshots.every((row) => row.snapshot_at === snapshotAt)).toBe(true);
  });

  it('parses recorded fundingHistory fixtures', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordedFundingHistory));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const history = await client.fetchFundingHistory('ETH', 1793613600000);
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({
      coin: 'ETH',
      funding_rate: 0.0000125,
      premium: -0.00012,
      time: 1793613600000,
    });
    const fundingCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit?];
    expect(JSON.parse(String(fundingCall[1]?.body))).toEqual({
      type: 'fundingHistory',
      coin: 'ETH',
      startTime: 1793613600000,
    });
  });

  it('retries 429 using Retry-After then succeeds', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(recordedMetaAndAssetCtxs));

    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
    });

    const snapshots = await client.fetchPerpSnapshots();
    expect(snapshots[0].coin).toBe('BTC');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('gives up after repeated 429s', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
    });

    await expect(client.fetchPerpSnapshots()).rejects.toMatchObject({
      name: 'HyperliquidError',
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('times out via AbortSignal', async () => {
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

  it('rejects invalid payloads', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ not: 'valid' }));
    const client = new HyperliquidClient({
      apiUrl: 'http://127.0.0.1:9',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.fetchPerpSnapshots()).rejects.toThrow(/validation/);
  });
});
