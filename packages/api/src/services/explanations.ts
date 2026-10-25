import { pool } from '../database.js';
import { createProvider, validateBaseUrl, getDefaultModel } from '@vault-risk-copilot/llm';
import type { LLMConfig, ExplanationOutput, RiskInput } from '@vault-risk-copilot/llm';
import type { LLMProviderConfig } from '../types/schemas.js';
import { getPoolById } from './pools.js';
import { HttpError } from '../lib/errors.js';

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
    fallback?: boolean;
    fallback_reason?: string;
  };
}

export async function getCachedExplanation(
  poolId: string,
  provider?: string,
  model?: string
): Promise<ExplanationResult | null> {
  const effectiveProvider = provider || 'mock';
  const effectiveModel = model || 'mock-v1';

  const query = `
    SELECT 
      e.explanation_text,
      e.risk_factors,
      e.provider,
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
      AND e.provider = $2
      AND e.model_name = $3
    ORDER BY e.generated_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [poolId, effectiveProvider, effectiveModel]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    explanation: row.risk_factors as ExplanationOutput,
    metadata: {
      model: row.model_name,
      provider: row.provider,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      latencyMs: row.latency_ms,
      costUsd: row.cost_usd,
      fallback: false, // Cached responses are never fallback (we don't cache fallbacks)
    },
  };
}

export async function generateExplanation(
  poolId: string,
  providerConfig?: LLMProviderConfig,
  apiKey?: string
): Promise<ExplanationResult> {
  const poolData = await getPoolById(poolId);

  if (!poolData) {
    throw new HttpError(404, 'Pool not found');
  }
  if (!poolData.risk_score) {
    throw new HttpError(404, 'Pool not found or has no risk score');
  }

  if (providerConfig?.baseUrl) {
    validateBaseUrl(providerConfig.baseUrl);
  }

  const providerName = providerConfig?.provider || (apiKey ? 'openai' : 'mock');
  const llmConfig: LLMConfig = {
    provider: providerName,
    apiKey,
    model: providerConfig?.model?.trim() || getDefaultModel(providerName),
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

  const effectiveProvider = providerConfig?.provider || 'mock';

  // Only cache successful (non-fallback) responses
  // Transient failures (rate limits, validation) must not stick
  if (!result.metadata.fallback) {
    await cacheExplanation(
      poolData.risk_score.id,
      poolId,
      result.output,
      {
        ...result.metadata,
        provider: effectiveProvider,
      }
    );
  }

  return {
    explanation: result.output,
    metadata: {
      ...result.metadata,
      provider: effectiveProvider,
    },
  };
}

async function cacheExplanation(
  riskScoreId: string,
  poolId: string,
  explanation: ExplanationOutput,
  metadata: {
    model: string;
    provider: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    costUsd?: number;
  }
): Promise<void> {
  const query = `
    INSERT INTO explanations (
      risk_score_id,
      pool_id,
      explanation_text,
      risk_factors,
      provider,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      latency_ms,
      cost_usd,
      generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (risk_score_id, provider, model_name)
    DO UPDATE SET
      explanation_text = EXCLUDED.explanation_text,
      risk_factors = EXCLUDED.risk_factors,
      prompt_tokens = EXCLUDED.prompt_tokens,
      completion_tokens = EXCLUDED.completion_tokens,
      total_tokens = EXCLUDED.total_tokens,
      latency_ms = EXCLUDED.latency_ms,
      cost_usd = EXCLUDED.cost_usd,
      generated_at = NOW()
  `;

  await pool.query(query, [
    riskScoreId,
    poolId,
    explanation.summary,
    JSON.stringify(explanation),
    metadata.provider,
    metadata.model,
    metadata.promptTokens || null,
    metadata.completionTokens || null,
    metadata.totalTokens || null,
    metadata.latencyMs,
    metadata.costUsd || null,
  ]);
}
