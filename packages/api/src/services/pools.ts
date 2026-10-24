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

  const pools = dataResult.rows.map((row: any) => ({
    ...row,
    tvl_usd: row.tvl_usd != null ? parseFloat(row.tvl_usd) : null,
    tvl_change_7d_pct: row.tvl_change_7d_pct != null ? parseFloat(row.tvl_change_7d_pct) : null,
    apy: row.apy != null ? parseFloat(row.apy) : null,
    apy_base: row.apy_base != null ? parseFloat(row.apy_base) : null,
    apy_reward: row.apy_reward != null ? parseFloat(row.apy_reward) : null,
    apy_sigma: row.apy_sigma != null ? parseFloat(row.apy_sigma) : null,
    apy_pct_7d: row.apy_pct_7d != null ? parseFloat(row.apy_pct_7d) : null,
    il_risk: row.il_risk != null ? parseFloat(row.il_risk) : null,
    total_risk_score: row.total_risk_score != null ? parseFloat(row.total_risk_score) : null,
  })) as PoolWithRisk[];

  return {
    pools,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function getPoolById(poolId: string): Promise<(PoolSnapshot & { risk_score: RiskScore | null }) | null> {
  const query = `
    WITH latest_snapshot AS (
      SELECT *
      FROM pool_snapshots
      WHERE pool_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    ),
    latest_risk_score AS (
      SELECT *
      FROM risk_scores
      WHERE pool_id = $1
      ORDER BY calculated_at DESC
      LIMIT 1
    )
    SELECT 
      ls.*,
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
    FROM latest_snapshot ls
    LEFT JOIN latest_risk_score rs ON TRUE
  `;

  const result = await pool.query(query, [poolId]);
  
  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  
  return {
    ...row,
    tvl_usd: row.tvl_usd != null ? parseFloat(row.tvl_usd) : null,
    tvl_change_7d_pct: row.tvl_change_7d_pct != null ? parseFloat(row.tvl_change_7d_pct) : null,
    apy: row.apy != null ? parseFloat(row.apy) : null,
    apy_base: row.apy_base != null ? parseFloat(row.apy_base) : null,
    apy_reward: row.apy_reward != null ? parseFloat(row.apy_reward) : null,
    apy_sigma: row.apy_sigma != null ? parseFloat(row.apy_sigma) : null,
    apy_pct_7d: row.apy_pct_7d != null ? parseFloat(row.apy_pct_7d) : null,
    il_risk: row.il_risk != null ? parseFloat(row.il_risk) : null,
    risk_score: row.risk_score ? {
      ...row.risk_score,
      total_risk_score: row.risk_score.total_risk_score != null ? parseFloat(row.risk_score.total_risk_score) : null,
      tvl_score: row.risk_score.tvl_score != null ? parseFloat(row.risk_score.tvl_score) : null,
      tvl_volatility_score: row.risk_score.tvl_volatility_score != null ? parseFloat(row.risk_score.tvl_volatility_score) : null,
      apy_volatility_score: row.risk_score.apy_volatility_score != null ? parseFloat(row.risk_score.apy_volatility_score) : null,
      reward_ratio_score: row.risk_score.reward_ratio_score != null ? parseFloat(row.risk_score.reward_ratio_score) : null,
      stablecoin_score: row.risk_score.stablecoin_score != null ? parseFloat(row.risk_score.stablecoin_score) : null,
      il_score: row.risk_score.il_score != null ? parseFloat(row.risk_score.il_score) : null,
      data_age_score: row.risk_score.data_age_score != null ? parseFloat(row.risk_score.data_age_score) : null,
      vault_score: row.risk_score.vault_score != null ? parseFloat(row.risk_score.vault_score) : null,
    } : null,
  };
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
  
  return result.rows.map((row: any) => ({
    ...row,
    tvl_usd: row.tvl_usd != null ? parseFloat(row.tvl_usd) : null,
    tvl_change_7d_pct: row.tvl_change_7d_pct != null ? parseFloat(row.tvl_change_7d_pct) : null,
    apy: row.apy != null ? parseFloat(row.apy) : null,
    apy_base: row.apy_base != null ? parseFloat(row.apy_base) : null,
    apy_reward: row.apy_reward != null ? parseFloat(row.apy_reward) : null,
    apy_sigma: row.apy_sigma != null ? parseFloat(row.apy_sigma) : null,
    apy_pct_7d: row.apy_pct_7d != null ? parseFloat(row.apy_pct_7d) : null,
    il_risk: row.il_risk != null ? parseFloat(row.il_risk) : null,
  })) as PoolSnapshot[];
}
