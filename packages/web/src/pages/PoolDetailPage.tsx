import { Link, useParams } from 'react-router-dom';
import { isPoolIdUuid, usePoolDetail, usePoolHistory } from '@/hooks/usePools';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { RiskBadge } from '@/components/RiskBadge';
import { ExplainPanel } from '@/components/ExplainPanel';
import { formatCompactUsd, formatNumber, formatPercentage, formatDate } from '@/lib/utils';
import { prepareChartData } from '@/utils/chartData';
import type { Pool, PoolRiskScore } from '@/types/api';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export function PoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const validId = isPoolIdUuid(id);
  const { data: pool, isLoading, error, refetch } = usePoolDetail(id!);
  const { data: history, isLoading: historyLoading } = usePoolHistory(id!);

  if (!validId) {
    return (
      <ErrorMessage message="This pool id is not a valid UUID. Open a pool from the list instead of editing the URL." />
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} onRetry={() => refetch()} />;
  }

  if (!pool) {
    return <ErrorMessage message="Pool not found" />;
  }

  const riskScore = (pool as Pool & { risk_score?: PoolRiskScore }).risk_score;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div>
        <Link to="/pools" className="text-primary-600 hover:text-primary-900 text-sm">
          ← Back to pools
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{pool.asset_symbol}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pool.protocol} • {pool.chain}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TVL" value={pool.tvl_usd !== null ? formatNumber(pool.tvl_usd) : 'N/A'} />
        <StatCard label="APY" value={pool.apy !== null ? formatPercentage(pool.apy) : 'N/A'} />
        <StatCard
          label="Risk Score"
          value={riskScore?.total_risk_score ? riskScore.total_risk_score.toFixed(1) : 'N/A'}
        />
        <StatCard
          label="Risk Category"
          value={
            riskScore?.risk_category ? (
              <RiskBadge category={riskScore.risk_category} />
            ) : (
              <span className="text-gray-400">N/A</span>
            )
          }
        />
      </div>

      {riskScore && <ExplainPanel poolId={pool.pool_id} />}

      {riskScore && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Risk Factor Breakdown
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={prepareChartData(riskScore)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">TVL Score:</span>{' '}
              <span className="font-medium">{riskScore.tvl_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">TVL Volatility:</span>{' '}
              <span className="font-medium">{riskScore.tvl_volatility_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">APY Volatility:</span>{' '}
              <span className="font-medium">{riskScore.apy_volatility_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">Reward Ratio:</span>{' '}
              <span className="font-medium">{riskScore.reward_ratio_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">IL Score:</span>{' '}
              <span className="font-medium">{riskScore.il_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">Data Age:</span>{' '}
              <span className="font-medium">{riskScore.data_age_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">Stablecoin:</span>{' '}
              <span className="font-medium">{riskScore.stablecoin_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600">Vault Score:</span>{' '}
              <span className="font-medium">{riskScore.vault_score?.toFixed(2) ?? 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {historyLoading ? (
        <LoadingSpinner />
      ) : history && history.length > 0 ? (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historical Data</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="snapshot_at"
                tickFormatter={(value) => formatDate(value)}
              />
              <YAxis 
                yAxisId="left" 
                tickFormatter={(value) => formatCompactUsd(Number(value))}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip
                labelFormatter={(value) => formatDate(value)}
                formatter={(value: number, name: string) => {
                  if (name === 'TVL') return formatNumber(value);
                  if (name === 'APY') return formatPercentage(value);
                  return value.toFixed(2);
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="tvl_usd"
                name="TVL"
                stroke="#0ea5e9"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="apy"
                name="APY"
                stroke="#10b981"
                strokeWidth={2}
              />
              {history.some((h) => h.score !== undefined) && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="score"
                  name="Risk Score"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-gray-500 text-center">No historical data available</p>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pool Information</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Pool ID</dt>
            <dd className="mt-1 text-sm text-gray-900 break-all font-mono text-xs">{pool.pool_id}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(pool.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Stablecoin</dt>
            <dd className="mt-1 text-sm text-gray-900">{pool.is_stablecoin ? 'Yes' : 'No'}</dd>
          </div>
          {pool.il_risk !== null && (
            <div>
              <dt className="text-sm font-medium text-gray-500">IL Risk</dt>
              <dd className="mt-1 text-sm text-gray-900">{pool.il_risk.toFixed(2)}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white shadow rounded-lg px-4 py-5">
      <dt className="text-sm font-medium text-gray-500 truncate">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
