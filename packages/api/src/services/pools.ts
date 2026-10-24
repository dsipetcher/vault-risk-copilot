import { pool } from '../database.js';
import type { PoolSnapshot, PoolFilters, PaginationQuery, PoolWithRisk, RiskScore } from '../types/schemas.js';

export async function getLatestPools(
  filters: PoolFilters,
  pagination: PaginationQuery
): Promise<{ pools: PoolWithRisk[]; total: number }> {
  const { limit, offset } = pagination;

  // Build WHERE clause dynamically
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.protocol) {
    conditions.push(`ps.protocol = $${paramIndex++}`);
    params.push(filters.protocol);
  }

  if (filters.chain) {
    conditions.push(`ps.chain = $${paramIndex++}`);
    params.push(filters.chain);
  }

  if (filters.is_stablecoin !== undefined) {
    conditions.push(`ps.is_stablecoin = $${paramIndex++}`);
    params.push(filters.is_stablecoin);
  }

  if (filters.risk_category) {
    conditions.push(`rs.risk_category = $${paramIndex++}`);
    params.push(filters.risk_category);
  }

  if (filters.min_tvl !== undefined) {
    conditions.push(`ps.tvl_usd >= $${paramIndex++}`);
    params.push(filters.min_tvl);
  }

  if (filters.max_tvl !== undefined) {
    conditions.push(`ps.tvl_usd <= $${paramIndex++}`);
    params.push(filters.max_tvl);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Subquery to get latest snapshots per pool_id
  const latestSnapshotsSubquery = `
    SELECT DISTINCT ON (pool_id) *
    FROM pool_snapshots
    ORDER BY pool_id, created_at DESC
  `;

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM (${latestSnapshotsSubquery}) ps
    LEFT JOIN risk_scores rs ON rs.snapshot_id = ps.id
    ${whereClause}
  `;

  // Data query
  const dataQuery = `
    SELECT 
      ps.*,
      rs.total_risk_score,
      rs.risk_category
    FROM (${latestSnapshotsSubquery}) ps
    LEFT JOIN risk_scores rs ON rs.snapshot_id = ps.id
    ${whereClause}
    ORDER BY ps.tvl_usd DESC NULLS LAST
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(dataQuery, [...params, limit, offset]),
  ]);

  return {
    pools: dataResult.rows as PoolWithRisk[],
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function getPoolById(poolId: string): Promise<(PoolSnapshot & { risk_score: RiskScore | null }) | null> {
  const query = `
    SELECT 
      ps.*,
      jsonb_build_object(
        'id', rs.id,
        'pool_id', rs.pool_id,
        'snapshot_id', rs.snapshot_id,
        'total_risk_score', rs.total_risk_score,
        'risk_category', rs.risk_category,
        'tvl_score', rs.tvl_score,
        'tvl_volatility_score', rs.tvl_volatility_score,
        'apy_volatility_score', rs.apy_volatility_score,
        'reward_ratio_score', rs.reward_ratio_score,
        'stablecoin_score', rs.stablecoin_score,
        'il_score', rs.il_score,
        'data_age_score', rs.data_age_score,
        'vault_score', rs.vault_score,
        'is_anomaly', rs.is_anomaly,
        'anomaly_reason', rs.anomaly_reason,
        'model_version', rs.model_version,
        'calculated_at', rs.calculated_at
      ) as risk_score
    FROM pool_snapshots ps
    LEFT JOIN risk_scores rs ON rs.snapshot_id = ps.id
    WHERE ps.pool_id = $1
    ORDER BY ps.created_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [poolId]);
  return result.rows[0] || null;
}

export async function getPoolHistory(poolId: string, limit: number = 30): Promise<PoolSnapshot[]> {
  const query = `
    SELECT *
    FROM pool_snapshots
    WHERE pool_id = $1
    ORDER BY snapshot_at DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [poolId, limit]);
  return result.rows as PoolSnapshot[];
}
