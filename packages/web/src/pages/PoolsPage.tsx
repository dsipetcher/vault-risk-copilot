import { useState } from 'react';
import { usePools } from '@/hooks/usePools';
import { RiskBadge } from '@/components/RiskBadge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { formatNumber, formatPercentage } from '@/lib/utils';
import type { Pool } from '@/types/api';

type SortField = 'tvl' | 'apy' | 'risk';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 50;

export function PoolsPage() {
  const [sortField, setSortField] = useState<SortField>('tvl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading, error, refetch } = usePools({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: submittedSearch || undefined,
    sort: sortField,
    order: sortDirection,
    risk_category: filterCategory,
  });

  const pools = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(submittedSearch || filterCategory !== 'all');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(0);
  };

  const applySearch = () => {
    setSubmittedSearch(searchTerm.trim());
    setPage(0);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSubmittedSearch('');
    setFilterCategory('all');
    setPage(0);
  };

  const sortedPools = pools;

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 data-testid="pools-title" className="text-3xl font-bold text-gray-900">DeFi Pools</h1>
          <p className="mt-2 text-sm text-gray-700">
            Risk analysis for DeFi lending and liquidity pools
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4" data-testid="pools-filters">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search pools or protocols..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            onBlur={applySearch}
            data-testid="pools-search"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value);
              setPage(0);
            }}
            data-testid="pools-risk-filter"
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
            <option value="critical">Critical Risk</option>
          </select>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            data-testid="clear-filters"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error.message} onRetry={() => refetch()} />
      ) : sortedPools.length === 0 ? (
        <EmptyState
          title="No pools found"
          description={hasFilters ? 'Try adjusting your filters or search term' : 'No pool snapshots are available yet'}
        />
      ) : (
        <>
          <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                    Pool
                  </th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Chain
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('tvl')}
                  >
                    <div className="flex items-center gap-1">
                      TVL
                      {sortField === 'tvl' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('apy')}
                  >
                    <div className="flex items-center gap-1">
                      APY
                      {sortField === 'apy' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('risk')}
                  >
                    <div className="flex items-center gap-1">
                      Risk
                      {sortField === 'risk' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="relative py-3.5 pl-3 pr-4">
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {sortedPools.map((pool) => (
                  <PoolRow key={pool.pool_id || String(pool.id)} pool={pool} />
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-gray-700" data-testid="pools-pagination">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1 border rounded-md disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-2 py-1">
                  Page {page + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded-md disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PoolRow({ pool }: { pool: Pool }) {
  const handleRowClick = () => {
    window.location.href = `/pools/${pool.pool_id}`;
  };

  return (
    <tr
      data-testid="pool-row"
      className="hover:bg-gray-50 cursor-pointer"
      onClick={handleRowClick}
    >
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
        <div className="font-medium text-gray-900">{pool.asset_symbol}</div>
        <div className="text-gray-500">{pool.protocol}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {pool.chain}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
        {pool.tvl_usd !== null ? formatNumber(pool.tvl_usd) : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
        {pool.apy !== null ? formatPercentage(pool.apy) : 'N/A'}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm">
        {pool.total_risk_score && pool.risk_category ? (
          <RiskBadge category={pool.risk_category} score={pool.total_risk_score} />
        ) : (
          <span className="text-gray-400">N/A</span>
        )}
      </td>
      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium">
        <a
          href={`/pools/${pool.pool_id}`}
          data-testid={`pool-link-${pool.pool_id}`}
          className="text-primary-600 hover:text-primary-900"
        >
          View
        </a>
      </td>
    </tr>
  );
}
