import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const listHyperliquidMarkets = vi.fn();
const getHyperliquidMarket = vi.fn();
const getHyperliquidFundingHistory = vi.fn();
const resolveCanonicalCoin = vi.fn();

vi.mock('../services/hyperliquid.js', () => ({
  COIN_PATTERN: /^[A-Za-z0-9:_-]{1,32}$/,
  listHyperliquidMarkets: (...args: unknown[]) => listHyperliquidMarkets(...args),
  getHyperliquidMarket: (...args: unknown[]) => getHyperliquidMarket(...args),
  getHyperliquidFundingHistory: (...args: unknown[]) => getHyperliquidFundingHistory(...args),
  resolveCanonicalCoin: (...args: unknown[]) => resolveCanonicalCoin(...args),
  resetHyperliquidClientForTests: vi.fn(),
}));

import { build } from '../index.js';
import { HyperliquidError } from '../lib/hyperliquid-client.js';

const sampleMarket = {
  coin: 'BTC',
  funding_rate: 0.0000125,
  open_interest: 40000,
  mark_px: 77000,
  oracle_px: 77020,
  oi_usd: 3_080_000_000,
  funding_annualized_pct: 10.95,
  snapshot_at: '2026-11-03T00:00:00.000Z',
  risk: {
    total_risk_score: 12.5,
    risk_category: 'low',
    model_version: 'hl-perp-1.0',
    signals: {
      funding_extreme: {
        id: 'funding_extreme',
        label: 'Extreme annualized funding',
        score: 8,
        value: '+10.95% / yr',
        explanation: 'Hourly funding annualizes to 10.95%.',
        applicable: true,
      },
      funding_volatility: {
        id: 'funding_volatility',
        label: 'Funding volatility',
        score: null,
        value: 'n/a',
        explanation: 'Need at least two collector snapshots.',
        applicable: false,
      },
      oi_concentration: {
        id: 'oi_concentration',
        label: 'OI concentration',
        score: 10,
        value: '1.10× 24h volume',
        explanation: 'Open interest is 1.10× 24h volume.',
        applicable: true,
      },
      mark_oracle_deviation: {
        id: 'mark_oracle_deviation',
        label: 'Mark/oracle deviation',
        score: 0,
        value: '0.026%',
        explanation: 'Mark and oracle differ by 0.026%.',
        applicable: true,
      },
    },
  },
};

describe('Hyperliquid routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listHyperliquidMarkets.mockReset();
    getHyperliquidMarket.mockReset();
    getHyperliquidFundingHistory.mockReset();
    resolveCanonicalCoin.mockReset();
  });

  it('lists perp markets with explainable signals', async () => {
    listHyperliquidMarkets.mockResolvedValue({
      data: [sampleMarket],
      pagination: { total: 1, limit: 200, offset: 0 },
      snapshot_at: sampleMarket.snapshot_at,
      source: 'snapshot',
    });

    const response = await app.inject({ method: 'GET', url: '/api/hyperliquid/markets?sort=oi' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.source).toBe('snapshot');
    expect(body.data[0].coin).toBe('BTC');
    expect(body.data[0].risk.signals.funding_extreme.explanation).toMatch(/funding/i);
  });

  it('returns one market', async () => {
    getHyperliquidMarket.mockResolvedValue(sampleMarket);
    const response = await app.inject({ method: 'GET', url: '/api/hyperliquid/markets/BTC' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.coin).toBe('BTC');
    expect(body.data.risk.model_version).toBe('hl-perp-1.0');
  });

  it('rejects an unsafe coin param', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/hyperliquid/markets/%2e%2e%2fetc' });
    expect(response.statusCode).toBe(400);
    expect(getHyperliquidMarket).not.toHaveBeenCalled();
  });

  it('serves funding history from the service (no live network in this test)', async () => {
    resolveCanonicalCoin.mockResolvedValue('ETH');
    getHyperliquidFundingHistory.mockResolvedValue({
      coin: 'ETH',
      source: 'live',
      cached: false,
      points: [{ time: 1700000000000, funding_rate: 0.0000125, premium: -0.0001, annualized_pct: 10.95 }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets/ETH/funding?hours=24',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.source).toBe('live');
    expect(body.points).toHaveLength(1);
    expect(getHyperliquidFundingHistory).toHaveBeenCalledWith('ETH', 24);
  });

  it('resolves a case-insensitive coin from the latest snapshot before calling Hyperliquid', async () => {
    resolveCanonicalCoin.mockResolvedValue('BTC');
    getHyperliquidFundingHistory.mockResolvedValue({
      coin: 'BTC',
      source: 'live',
      cached: false,
      points: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets/btc/funding',
    });
    expect(response.statusCode).toBe(200);
    expect(resolveCanonicalCoin).toHaveBeenCalledWith('btc');
    expect(getHyperliquidFundingHistory).toHaveBeenCalledWith('BTC', 24);
  });

  it('returns 404 for an unknown coin without calling Hyperliquid', async () => {
    resolveCanonicalCoin.mockResolvedValue(null);
    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets/NOPE/funding',
    });
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Market not found');
    expect(getHyperliquidFundingHistory).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer hours instead of a raw Zod 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets/ETH/funding?hours=1.5',
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid query');
    expect(resolveCanonicalCoin).not.toHaveBeenCalled();
    expect(getHyperliquidFundingHistory).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer market limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets?limit=1.5',
    });
    expect(response.statusCode).toBe(400);
    expect(listHyperliquidMarkets).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer pools limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/pools?limit=1.5',
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid query');
  });

  it('maps upstream 429 to HTTP 429', async () => {
    resolveCanonicalCoin.mockResolvedValue('ETH');
    getHyperliquidFundingHistory.mockRejectedValue(new HyperliquidError('Hyperliquid rate limited', 429));
    const response = await app.inject({
      method: 'GET',
      url: '/api/hyperliquid/markets/ETH/funding',
    });
    expect(response.statusCode).toBe(429);
  });
});
