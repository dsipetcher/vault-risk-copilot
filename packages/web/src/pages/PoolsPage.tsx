import { useMemo, useState } from 'react';
import { usePools } from '@/hooks/usePools';
import { RiskBadge } from '@/components/RiskBadge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { formatNumber, formatPercentage } from '@/lib/utils';
import type { Pool } from '@/types/api';

type SortField = 'tvl' | 'apy' | 'risk';
type SortDirection = 'asc' | 'desc';

export function PoolsPage() {
  const { data: pools, isLoading, error } = usePools();
  const [sortField, setSortField] = useState<SortField>('tvl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAndSortedPools = useMemo(() => {
    if (!pools) return [];

    let filtered = [...pools];

    if (searchTerm) {
      filtered = filtered.filter(
        (pool) =>
          pool.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pool.protocol.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(
        (pool) => (pool as any).risk_score?.category === filterCategory
      );
    }

    filtered.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (sortField) {
        case 'tvl':
          aVal = a.tvl_usd;
          bVal = b.tvl_usd;
          break;
        case 'apy':
          aVal = a.apy;
          bVal = b.apy;
          break;
        case 'risk':
          aVal = (a as any).risk_score?.score ?? 0;
          bVal = (b as any).risk_score?.score ?? 0;
          break;
        default:
          return 0;
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [pools, sortField, sortDirection, filterCategory, searchTerm]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">DeFi Pools</h1>
          <p className="mt-2 text-sm text-gray-700">
            Risk analysis for DeFi lending and liquidity pools
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search pools or protocols..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
            <option value="critical">Critical Risk</option>
          </select>
        </div>
      </div>

      {filteredAndSortedPools.length === 0 ? (
        <EmptyState
          title="No pools found"
          description="Try adjusting your filters or search term"
        />
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
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
              {filteredAndSortedPools.map((pool) => (
                <PoolRow key={pool.id} pool={pool} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PoolRow({ pool }: { pool: Pool }) {
  const riskScore = (pool as any).risk_score;

  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
        <div className="font-medium text-gray-900">{pool.symbol}</div>
        <div className="text-gray-500">{pool.protocol}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {pool.chain}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
        {formatNumber(pool.tvl_usd)}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
        {formatPercentage(pool.apy)}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm">
        {riskScore ? (
          <RiskBadge category={riskScore.category} score={riskScore.score} />
        ) : (
          <span className="text-gray-400">N/A</span>
        )}
      </td>
      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium">
        <a
          href={`/pools/${pool.id}`}
          className="text-primary-600 hover:text-primary-900"
        >
          View
        </a>
      </td>
    </tr>
  );
}
