import { z } from 'zod';

export const riskFactorSchema = z.object({
  signal: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  explanation: z.string().min(10).max(500),
});

export type RiskFactor = z.infer<typeof riskFactorSchema>;

export const explanationOutputSchema = z.object({
  summary: z.string().min(20).max(1000),
  key_factors: z.array(riskFactorSchema).min(1).max(8),
  disclaimer: z.string().min(20).max(500),
});

export type ExplanationOutput = z.infer<typeof explanationOutputSchema>;

export const riskInputSchema = z.object({
  pool_id: z.string().uuid(),
  pool_name: z.string().max(200),
  protocol: z.string().max(100),
  chain: z.string().max(50),
  total_risk_score: z.number().min(0).max(100),
  risk_category: z.enum(['low', 'medium', 'high', 'critical']),
  breakdown: z.object({
    tvl_score: z.number().min(0).max(100),
    tvl_volatility_score: z.number().min(0).max(100),
    apy_volatility_score: z.number().min(0).max(100),
    reward_ratio_score: z.number().min(0).max(100),
    stablecoin_score: z.number().min(0).max(100),
    il_score: z.number().min(0).max(100),
    data_age_score: z.number().min(0).max(100),
    vault_score: z.number().min(0).max(100),
  }),
  pool_metrics: z.object({
    tvl_usd: z.number().nullable(),
    tvl_change_7d_pct: z.number().nullable(),
    apy: z.number().nullable(),
    apy_base: z.number().nullable(),
    apy_reward: z.number().nullable(),
    apy_sigma: z.number().nullable(),
    il_risk: z.number().nullable(),
    is_stablecoin: z.boolean(),
    count: z.number().nullable(),
  }),
});

export type RiskInput = z.infer<typeof riskInputSchema>;
