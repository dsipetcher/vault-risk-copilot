import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HyperliquidPage } from '../HyperliquidPage';
import type { HyperliquidMarket } from '@/types/api';

const refetch = vi.fn();

const btc: HyperliquidMarket = {
  coin: 'BTC',
  sz_decimals: 5,
  max_leverage: 40,
  only_isolated: false,
  is_delisted: false,
  funding_rate: 0.0000125,
  open_interest: 40000,
  mark_px: 77000,
  oracle_px: 77020,
  mid_px: 77010,
  premium: -0.0003,
  prev_day_px: 78000,
  day_ntl_vlm: 2_700_000_000,
  day_base_vlm: 35,
  oi_usd: 3_080_000_000,
  funding_annualized_pct: 10.95,
  mark_oracle_deviation_pct: 0.026,
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

const extraMarkets: HyperliquidMarket[] = Array.from({ length: 26 }, (_, i) => ({
  ...btc,
  coin: i === 0 ? 'BTC' : `M${i}`,
}));

vi.mock('@/hooks/useHyperliquid', () => ({
  useHyperliquidMarkets: () => ({
    data: {
      data: extraMarkets.slice(0, 25),
      pagination: { total: 26, limit: 25, offset: 0 },
      snapshot_at: btc.snapshot_at,
      source: 'snapshot',
    },
    isLoading: false,
    error: null,
    refetch,
  }),
  useHyperliquidMarket: () => ({ data: btc, isLoading: false, error: null }),
  useHyperliquidFunding: () => ({
    data: {
      coin: 'BTC',
      cached: false,
      source: 'live',
      points: [
        { time: 1700000000000, funding_rate: 0.0000125, premium: -0.0001, annualized_pct: 10.95 },
        { time: 1700003600000, funding_rate: 0.000018, premium: -0.0002, annualized_pct: 15.77 },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

describe('HyperliquidPage', () => {
  beforeEach(() => {
    refetch.mockClear();
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it('renders the table, explainable signals, and funding chart', async () => {
    render(
      <MemoryRouter>
        <HyperliquidPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('hyperliquid-title')).toHaveTextContent('Hyperliquid perps');
    expect(screen.getByText(/No trading, no API keys/i)).toBeInTheDocument();
    expect(screen.getByTestId('hyperliquid-table')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByTestId('hyperliquid-signals')).toHaveTextContent('Extreme annualized funding');
    expect(screen.getByTestId('hyperliquid-funding-chart')).toBeInTheDocument();
    expect(screen.getByTestId('hyperliquid-pagination')).toHaveTextContent('of 26');

    const detail = screen.getByTestId('hyperliquid-detail');
    const table = screen.getByTestId('hyperliquid-table');
    expect(detail.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByTestId('hyperliquid-sort-funding'));
    expect(screen.getByTestId('hyperliquid-sort-funding')).toHaveTextContent(/Funding/);
  });
});
