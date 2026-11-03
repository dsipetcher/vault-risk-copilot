import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../database.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

import { getHyperliquidMarket, resolveCanonicalCoin } from './hyperliquid.js';

const btcRow = {
  coin: 'BTC',
  sz_decimals: 5,
  max_leverage: 40,
  only_isolated: false,
  is_delisted: false,
  funding_rate: '0.0000125',
  open_interest: '40000',
  mark_px: '77000',
  oracle_px: '77020',
  mid_px: '77010',
  premium: '-0.0003',
  prev_day_px: '78000',
  day_ntl_vlm: '2700000000',
  day_base_vlm: '35',
  snapshot_at: new Date('2026-11-03T00:00:00.000Z'),
};

describe('hyperliquid service lookups', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('resolves the canonical snapshot coin case-insensitively', async () => {
    query.mockResolvedValueOnce({ rows: [{ coin: 'BTC' }] });
    expect(await resolveCanonicalCoin('btc')).toBe('BTC');
    expect(query.mock.calls[0][1]).toEqual(['btc']);
  });

  it('returns null when the coin is not in snapshots', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await resolveCanonicalCoin('NOPE')).toBeNull();
  });

  it('loads one coin plus listed OI instead of every market history', async () => {
    query
      .mockResolvedValueOnce({ rows: [btcRow] })
      .mockResolvedValueOnce({ rows: [{ funding_rate: '0.0000125' }, { funding_rate: '0.0000126' }] })
      .mockResolvedValueOnce({
        rows: [
          { open_interest: '40000', mark_px: '77000' },
          { open_interest: '10', mark_px: '1' },
        ],
      });

    const market = await getHyperliquidMarket('btc');
    expect(market?.coin).toBe('BTC');
    expect(query).toHaveBeenCalledTimes(3);

    const coinLookupSql = String(query.mock.calls[0][0]);
    expect(coinLookupSql).toMatch(/lower\(coin\) = lower\(\$1\)/);
    expect(query.mock.calls[0][1]).toEqual(['btc']);

    const historySql = String(query.mock.calls[1][0]);
    expect(historySql).toMatch(/WHERE coin = \$1/);
    expect(historySql).not.toMatch(/ANY\(/);
    expect(query.mock.calls[1][1]).toEqual(['BTC', 48]);

    const listedOiSql = String(query.mock.calls[2][0]);
    expect(listedOiSql).toMatch(/is_delisted = false/);
  });
});
