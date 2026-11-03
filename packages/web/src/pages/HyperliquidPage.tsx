import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHyperliquidFunding, useHyperliquidMarkets, type HyperliquidSort } from '@/hooks/useHyperliquid';
import { RiskBadge } from '@/components/RiskBadge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime, formatNumber, formatPercentage } from '@/lib/utils';
import type { HyperliquidMarket } from '@/types/api';

type SortDirection = 'asc' | 'desc';

const SORT_COLUMNS: Array<{ field: HyperliquidSort; label: string }> = [
  { field: 'coin', label: 'Market' },
  { field: 'funding', label: 'Funding (ann.)' },
  { field: 'oi', label: 'Open interest' },
  { field: 'volume', label: '24h volume' },
  { field: 'deviation', label: 'Mark vs oracle' },
  { field: 'risk', label: 'Risk' },
];

export function HyperliquidPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortField, setSortField] = useState<HyperliquidSort>('oi');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  const selectedCoin = searchParams.get('coin');

  const { data, isLoading, error, refetch } = useHyperliquidMarkets({
    search: submittedSearch || undefined,
    sort: sortField,
    order: sortDirection,
  });

  const markets = data?.data;
  const selected = useMemo(() => {
    const rows = markets ?? [];
    return rows.find((row) => row.coin === selectedCoin) ?? rows[0] ?? null;
  }, [markets, selectedCoin]);

  const { data: funding, isLoading: fundingLoading, error: fundingError } = useHyperliquidFunding(
    selected?.coin ?? null
  );

  const handleSort = (field: HyperliquidSort) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'coin' ? 'asc' : 'desc');
    }
  };

  const selectCoin = (coin: string) => {
    setSearchParams({ coin });
  };

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 data-testid="hyperliquid-title" className="text-3xl font-bold text-gray-900">
          Hyperliquid perps
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          Read-only public market data from Hyperliquid. No trading, no API keys, not financial advice.
        </p>
      </div>

      <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900" data-testid="hyperliquid-disclaimer">
        Funding, open interest, and mark/oracle prices are snapshots from the public Info API.
        Risk scores are simple, explainable heuristics — they are not a trading signal.
      </div>

      <div className="flex flex-col sm:flex-row gap-4" data-testid="hyperliquid-filters">
        <input
          type="text"
          placeholder="Search coin…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSubmittedSearch(searchTerm.trim());
          }}
          onBlur={() => setSubmittedSearch(searchTerm.trim())}
          data-testid="hyperliquid-search"
          className="w-full sm:max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error.message} onRetry={() => refetch()} />
      ) : !markets || markets.length === 0 ? (
        <EmptyState
          title="No Hyperliquid snapshots yet"
          description="The collector writes perp snapshots every few minutes. If this is a fresh stack, wait for the first cycle."
        />
      ) : (
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300" data-testid="hyperliquid-table">
            <thead className="bg-gray-50">
              <tr>
                {SORT_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                    onClick={() => handleSort(col.field)}
                    data-testid={`hyperliquid-sort-${col.field}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.field && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(markets ?? []).map((market) => (
                <MarketRow
                  key={market.coin}
                  market={market}
                  selected={selected?.coin === market.coin}
                  onSelect={selectCoin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="hyperliquid-detail">
          <div className="bg-white shadow rounded-lg p-6 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selected.coin} risk signals
            </h2>
            <div className="mb-3">
              <RiskBadge
                category={selected.risk.risk_category}
                score={selected.risk.total_risk_score}
              />
            </div>
            <ul className="space-y-3" data-testid="hyperliquid-signals">
              {Object.values(selected.risk.signals).map((signal) => (
                <li key={signal.id} className="text-sm">
                  <div className="font-medium text-gray-900">
                    {signal.label}: {signal.value}
                    {signal.score != null ? ` (${signal.score.toFixed(0)})` : ''}
                  </div>
                  <p className="text-gray-600">{signal.explanation}</p>
                </li>
              ))}
            </ul>
            {data?.snapshot_at && (
              <p className="mt-4 text-xs text-gray-500">Snapshot {formatDateTime(data.snapshot_at)}</p>
            )}
          </div>

          <div className="bg-white shadow rounded-lg p-6 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selected.coin} funding history
            </h2>
            {fundingLoading ? (
              <LoadingSpinner />
            ) : fundingError ? (
              <ErrorMessage message={fundingError.message} />
            ) : funding && funding.points.length > 0 ? (
              <div className="h-64" data-testid="hyperliquid-funding-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={funding.points}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(value) =>
                        new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      }
                    />
                    <YAxis tickFormatter={(value) => `${Number(value).toFixed(1)}%`} />
                    <Tooltip
                      labelFormatter={(value) => formatDateTime(new Date(Number(value)))}
                      formatter={(value: number) => [`${value.toFixed(2)}%`, 'Annualized funding']}
                    />
                    <Line
                      type="monotone"
                      dataKey="annualized_pct"
                      name="Annualized funding"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No funding history for this coin.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketRow({
  market,
  selected,
  onSelect,
}: {
  market: HyperliquidMarket;
  selected: boolean;
  onSelect: (coin: string) => void;
}) {
  return (
    <tr
      data-testid="hyperliquid-row"
      data-coin={market.coin}
      className={`cursor-pointer ${selected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
      onClick={() => onSelect(market.coin)}
    >
      <td className="whitespace-nowrap py-3 pl-3 pr-3 text-sm">
        <div className="font-medium text-gray-900">{market.coin}</div>
        <div className="text-gray-500">{market.max_leverage ? `${market.max_leverage}x` : 'perp'}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
        {market.funding_annualized_pct != null
          ? formatPercentage(market.funding_annualized_pct)
          : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
        {market.oi_usd != null ? formatNumber(market.oi_usd) : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
        {market.day_ntl_vlm != null ? formatNumber(market.day_ntl_vlm) : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
        {market.mark_oracle_deviation_pct != null
          ? `${market.mark_oracle_deviation_pct.toFixed(3)}%`
          : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm">
        <RiskBadge category={market.risk.risk_category} score={market.risk.total_risk_score} />
      </td>
    </tr>
  );
}
