import type { FastifyInstance } from 'fastify';
import { query } from '../lib/db.js';
import type { Pool, PoolHistory } from '../types/index.js';

export async function poolsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/pools', async (request, reply) => {
    try {
      const result = await query<any>(`
        SELECT DISTINCT ON (ps.pool_id)
          ps.pool_id as id,
          ps.protocol,
          ps.asset_symbol as symbol,
          ps.chain,
          ps.tvl_usd,
          ps.apy,
          ps.il_risk,
          ps.snapshot_at as updated_at,
          rs.total_risk_score,
          rs.risk_category,
          rs.tvl_score,
          rs.tvl_volatility_score,
          rs.apy_volatility_score,
          rs.reward_ratio_score,
          rs.il_score,
          rs.is_anomaly,
          rs.calculated_at
        FROM pool_snapshots ps
        LEFT JOIN risk_scores rs ON ps.pool_id = rs.pool_id
        ORDER BY ps.pool_id, ps.snapshot_at DESC, rs.calculated_at DESC NULLS LAST
        LIMIT 100
      `);

      const pools: Pool[] = result.rows.map((row) => ({
        id: row.id,
        protocol: row.protocol,
        symbol: row.symbol || 'Unknown',
        chain: row.chain,
        tvl_usd: parseFloat(row.tvl_usd) || 0,
        apy: parseFloat(row.apy) || 0,
        pool_meta: {
          ilRisk: row.il_risk ? row.il_risk.toString() : undefined,
        },
        updated_at: row.updated_at,
        risk_score: row.total_risk_score
          ? {
              score: parseFloat(row.total_risk_score),
              category: row.risk_category,
              factors: {
                tvl_level: parseFloat(row.tvl_score) || 0,
                tvl_change: parseFloat(row.tvl_volatility_score) || 0,
                apy_volatility: parseFloat(row.apy_volatility_score) || 0,
                reward_ratio: parseFloat(row.reward_ratio_score) || 0,
                il_risk: parseFloat(row.il_score) || 0,
                anomaly_score: row.is_anomaly ? 10 : 0,
              },
              computed_at: row.calculated_at,
            }
          : undefined,
      }));

      return pools;
    } catch (error: any) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch pools', message: error.message };
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/pools/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await query<any>(
        `
        SELECT 
          ps.pool_id as id,
          ps.protocol,
          ps.asset_symbol as symbol,
          ps.chain,
          ps.tvl_usd,
          ps.apy,
          ps.il_risk,
          ps.snapshot_at as updated_at,
          rs.total_risk_score,
          rs.risk_category,
          rs.tvl_score,
          rs.tvl_volatility_score,
          rs.apy_volatility_score,
          rs.reward_ratio_score,
          rs.il_score,
          rs.is_anomaly,
          rs.calculated_at
        FROM pool_snapshots ps
        LEFT JOIN risk_scores rs ON ps.pool_id = rs.pool_id
        WHERE ps.pool_id = $1
        ORDER BY ps.snapshot_at DESC, rs.calculated_at DESC NULLS LAST
        LIMIT 1
      `,
        [id]
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'Pool not found' };
      }

      const row = result.rows[0];
      const pool: Pool = {
        id: row.id,
        protocol: row.protocol,
        symbol: row.symbol || 'Unknown',
        chain: row.chain,
        tvl_usd: parseFloat(row.tvl_usd) || 0,
        apy: parseFloat(row.apy) || 0,
        pool_meta: {
          ilRisk: row.il_risk ? row.il_risk.toString() : undefined,
        },
        updated_at: row.updated_at,
        risk_score: row.total_risk_score
          ? {
              score: parseFloat(row.total_risk_score),
              category: row.risk_category,
              factors: {
                tvl_level: parseFloat(row.tvl_score) || 0,
                tvl_change: parseFloat(row.tvl_volatility_score) || 0,
                apy_volatility: parseFloat(row.apy_volatility_score) || 0,
                reward_ratio: parseFloat(row.reward_ratio_score) || 0,
                il_risk: parseFloat(row.il_score) || 0,
                anomaly_score: row.is_anomaly ? 10 : 0,
              },
              computed_at: row.calculated_at,
            }
          : undefined,
      };

      return pool;
    } catch (error: any) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch pool', message: error.message };
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/pools/:id/history', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await query<any>(
        `
        SELECT 
          ps.snapshot_at as timestamp,
          ps.tvl_usd,
          ps.apy,
          rs.total_risk_score as score
        FROM pool_snapshots ps
        LEFT JOIN risk_scores rs ON ps.pool_id = rs.pool_id AND ps.id = rs.snapshot_id
        WHERE ps.pool_id = $1
        ORDER BY ps.snapshot_at ASC
        LIMIT 100
      `,
        [id]
      );

      const history: PoolHistory[] = result.rows.map((row) => ({
        timestamp: row.timestamp,
        tvl_usd: parseFloat(row.tvl_usd) || 0,
        apy: parseFloat(row.apy) || 0,
        score: row.score ? parseFloat(row.score) : undefined,
      }));

      return history;
    } catch (error: any) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch pool history', message: error.message };
    }
  });
}
