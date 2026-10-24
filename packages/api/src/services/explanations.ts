import { pool } from '../database.js';
import { createProvider, validateBaseUrl } from '@vault-risk-copilot/llm';
import type { LLMConfig, ExplanationOutput, RiskInput } from '@vault-risk-copilot/llm';
import type { LLMProviderConfig } from '../types/schemas.js';
import { getPoolById } from './pools.js';

export interface ExplanationResult {
  explanation: ExplanationOutput;
  metadata: {
    model: string;
    provider: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    costUsd?: number;
  };
}

export async function getCachedExplanation(
  poolId: string,
  provider?: string,
  model?: string
): Promise<ExplanationResult | null> {
  const cacheKey = getCacheKey(poolId, provider, model);

  const query = `
    SELECT 
      e.explanation_text,
      e.risk_factors,
      e.model_name,
      e.prompt_tokens,
      e.completion_tokens,
      e.total_tokens,
      e.latency_ms,
      e.cost_usd,
      e.generated_at
    FROM explanations e
    INNER JOIN risk_scores rs ON rs.id = e.risk_score_id
    WHERE rs.pool_id = $1
      AND e.model_name = $2
    ORDER BY e.generated_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [poolId, cacheKey]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    explanation: row.risk_factors as ExplanationOutput,
    metadata: {
      model: row.model_name,
      provider: provider || 'unknown',
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      latencyMs: row.latency_ms,
      costUsd: row.cost_usd,
    },
  };
}

export async function generateExplanation(
  poolId: string,
  providerConfig?: LLMProviderConfig,
  apiKey?: string
): Promise<ExplanationResult> {
  const poolData = await getPoolById(poolId);

  if (!poolData || !poolData.risk_score) {
    throw new Error(`Pool ${poolId} not found or has no risk score`);
  }

  if (providerConfig?.baseUrl) {
    validateBaseUrl(providerConfig.baseUrl);
  }

  const llmConfig: LLMConfig = {
    provider: providerConfig?.provider || (apiKey ? 'openai' : 'mock'),
    apiKey,
    model: providerConfig?.model,
    baseUrl: providerConfig?.baseUrl,
  };

  const provider = createProvider(llmConfig);

  const riskInput: RiskInput = {
    pool_id: poolData.pool_id,
    pool_name: poolData.pool_name || 'Unknown Pool',
    protocol: poolData.protocol,
    chain: poolData.chain,
    total_risk_score: poolData.risk_score.total_risk_score,
    risk_category: poolData.risk_score.risk_category,
    breakdown: {
      tvl_score: poolData.risk_score.tvl_score,
      tvl_volatility_score: poolData.risk_score.tvl_volatility_score,
      apy_volatility_score: poolData.risk_score.apy_volatility_score,
      reward_ratio_score: poolData.risk_score.reward_ratio_score,
      stablecoin_score: poolData.risk_score.stablecoin_score,
      il_score: poolData.risk_score.il_score,
      data_age_score: poolData.risk_score.data_age_score,
      vault_score: poolData.risk_score.vault_score,
    },
    pool_metrics: {
      tvl_usd: poolData.tvl_usd,
      tvl_change_7d_pct: poolData.tvl_change_7d_pct,
      apy: poolData.apy,
      apy_base: poolData.apy_base,
      apy_reward: poolData.apy_reward,
      apy_sigma: poolData.apy_sigma,
      il_risk: poolData.il_risk,
      is_stablecoin: poolData.is_stablecoin,
      count: poolData.count,
    },
  };

  const result = await provider.generate(riskInput);

  const cacheKey = getCacheKey(
    poolId,
    providerConfig?.provider || 'mock',
    providerConfig?.model
  );

  await cacheExplanation(
    poolData.risk_score.id,
    poolId,
    result.output,
    result.metadata,
    cacheKey
  );

  return {
    explanation: result.output,
    metadata: {
      ...result.metadata,
      provider: providerConfig?.provider || 'mock',
    },
  };
}

function getCacheKey(poolId: string, provider?: string, model?: string): string {
  const parts = [poolId];
  if (provider) parts.push(provider);
  if (model) parts.push(model);
  return parts.join(':');
}

async function cacheExplanation(
  riskScoreId: string,
  poolId: string,
  explanation: ExplanationOutput,
  metadata: {
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    costUsd?: number;
  },
  cacheKey: string
): Promise<void> {
  const query = `
    INSERT INTO explanations (
      risk_score_id,
      pool_id,
      explanation_text,
      risk_factors,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      latency_ms,
      cost_usd,
      generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
  `;

  await pool.query(query, [
    riskScoreId,
    poolId,
    explanation.summary,
    JSON.stringify(explanation),
    cacheKey,
    metadata.promptTokens || null,
    metadata.completionTokens || null,
    metadata.totalTokens || null,
    metadata.latencyMs,
    metadata.costUsd || null,
  ]);
}
