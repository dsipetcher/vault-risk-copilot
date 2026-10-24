import { useParams } from 'react-router-dom';
import { usePoolDetail, usePoolHistory } from '@/hooks/usePools';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { RiskBadge } from '@/components/RiskBadge';
import { formatNumber, formatPercentage, formatDate } from '@/lib/utils';
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
  const { data: pool, isLoading, error } = usePoolDetail(id!);
  const { data: history, isLoading: historyLoading } = usePoolHistory(id!);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  if (!pool) {
    return <ErrorMessage message="Pool not found" />;
  }

  const riskScore = pool.risk_score;

  return (
    <div className="space-y-6">
      <div>
        <a href="/pools" className="text-primary-600 hover:text-primary-900 text-sm">
          ← Back to pools
        </a>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{pool.symbol}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pool.protocol} • {pool.chain}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TVL" value={formatNumber(pool.tvl_usd)} />
        <StatCard label="APY" value={formatPercentage(pool.apy)} />
        <StatCard
          label="Risk Score"
          value={riskScore ? riskScore.score.toFixed(1) : 'N/A'}
        />
        <StatCard
          label="Risk Category"
          value={
            riskScore ? (
              <RiskBadge category={riskScore.category} />
            ) : (
              <span className="text-gray-400">N/A</span>
            )
          }
        />
      </div>

      {riskScore && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Risk Factor Breakdown
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={[
                { name: 'TVL Level', value: riskScore.factors.tvl_level },
                { name: 'TVL Change', value: riskScore.factors.tvl_change },
                { name: 'APY Volatility', value: riskScore.factors.apy_volatility },
                { name: 'Reward Ratio', value: riskScore.factors.reward_ratio },
                { name: 'IL Risk', value: riskScore.factors.il_risk },
                { name: 'Anomaly', value: riskScore.factors.anomaly_score },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">TVL Level:</span>{' '}
              <span className="font-medium">{riskScore.factors.tvl_level.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">TVL Change:</span>{' '}
              <span className="font-medium">{riskScore.factors.tvl_change.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">APY Volatility:</span>{' '}
              <span className="font-medium">{riskScore.factors.apy_volatility.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Reward Ratio:</span>{' '}
              <span className="font-medium">{riskScore.factors.reward_ratio.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">IL Risk:</span>{' '}
              <span className="font-medium">{riskScore.factors.il_risk.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Anomaly Score:</span>{' '}
              <span className="font-medium">{riskScore.factors.anomaly_score.toFixed(2)}</span>
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
                dataKey="timestamp"
                tickFormatter={(value) => formatDate(value)}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
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
            <dd className="mt-1 text-sm text-gray-900 break-all">{pool.id}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(pool.updated_at)}</dd>
          </div>
          {pool.pool_meta.ilRisk && (
            <div>
              <dt className="text-sm font-medium text-gray-500">IL Risk</dt>
              <dd className="mt-1 text-sm text-gray-900">{pool.pool_meta.ilRisk}</dd>
            </div>
          )}
          {pool.pool_meta.exposure && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Exposure</dt>
              <dd className="mt-1 text-sm text-gray-900">{pool.pool_meta.exposure}</dd>
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
