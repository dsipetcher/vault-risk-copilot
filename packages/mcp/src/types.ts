import { z } from 'zod';

export const poolSnapshotSchema = z.object({
  id: z.union([z.number(), z.string()]),
  pool_id: z.string().uuid(),
  protocol: z.string(),
  chain: z.string(),
  pool_name: z.string().nullable(),
  asset_symbol: z.string(),
  is_stablecoin: z.boolean(),
  tvl_usd: z.number().nullable(),
  tvl_change_7d_pct: z.number().nullable(),
  apy: z.number().nullable(),
  apy_base: z.number().nullable(),
  apy_reward: z.number().nullable(),
  apy_sigma: z.number().nullable(),
  apy_pct_7d: z.number().nullable(),
  il_risk: z.number().nullable(),
  count: z.number().nullable(),
  snapshot_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const riskScoreSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  pool_id: z.string().uuid().nullable().optional(),
  snapshot_id: z.string().uuid().nullable().optional(),
  total_risk_score: z.number().nullable().optional(),
  risk_category: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
  tvl_score: z.number().nullable().optional(),
  tvl_volatility_score: z.number().nullable().optional(),
  apy_volatility_score: z.number().nullable().optional(),
  reward_ratio_score: z.number().nullable().optional(),
  stablecoin_score: z.number().nullable().optional(),
  il_score: z.number().nullable().optional(),
  data_age_score: z.number().nullable().optional(),
  vault_score: z.number().nullable().optional(),
  is_anomaly: z.boolean().nullable().optional(),
  anomaly_reason: z.string().nullable().optional(),
  model_version: z.string().nullable().optional(),
  calculated_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const poolWithRiskSchema = poolSnapshotSchema.merge(
  riskScoreSchema.pick({
    total_risk_score: true,
    risk_category: true,
  })
);

export const poolDetailsSchema = poolSnapshotSchema.extend({
  risk_score: riskScoreSchema.optional(),
});

export const vaultStateSchema = z.object({
  vault_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain_id: z.number(),
  total_assets: z.string(),
  total_supply: z.string(),
  share_price: z.number(),
  block_number: z.number(),
  snapshot_at: z.string().datetime(),
});

export const explanationSchema = z.object({
  explanation: z.object({
    summary: z.string(),
    key_factors: z.array(
      z.object({
        signal: z.string(),
        value: z.string(),
        explanation: z.string(),
      })
    ),
    disclaimer: z.string(),
  }),
  metadata: z.object({
    provider: z.string(),
    model: z.string(),
    timestamp: z.string(),
    latency_ms: z.number(),
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
    fallback: z.boolean().optional(),
    fallback_reason: z.string().optional(),
  }),
  cached: z.boolean(),
});

export type PoolSnapshot = z.infer<typeof poolSnapshotSchema>;
export type RiskScore = z.infer<typeof riskScoreSchema>;
export type PoolWithRisk = z.infer<typeof poolWithRiskSchema>;
export type PoolDetails = z.infer<typeof poolDetailsSchema>;
export type VaultState = z.infer<typeof vaultStateSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
