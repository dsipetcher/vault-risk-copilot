import { z } from 'zod';
import type { ApiClient } from './api-client.js';
import { ApiError } from './api-client.js';

const MAX_POOLS_LIMIT = 50;
const MAX_COMPARE_POOLS = 5;
const MIN_COMPARE_POOLS = 2;

export const listPoolsInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_POOLS_LIMIT).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  chain: z.string().optional(),
  protocol: z.string().optional(),
  min_tvl: z.number().min(0).optional(),
  sort: z.enum(['tvl', 'risk', 'apy']).optional(),
});

export const getPoolRiskInputSchema = z.object({
  pool_id: z.string().uuid(),
});

export const comparePoolsInputSchema = z.object({
  pool_ids: z.array(z.string().uuid()).min(MIN_COMPARE_POOLS).max(MAX_COMPARE_POOLS),
});

export const explainPoolRiskInputSchema = z.object({
  pool_id: z.string().uuid(),
});

export const getVaultInfoInputSchema = z.object({});

const MCP_ERROR_PREFIX = /^MCP error -?\d+:\s*/i;

export function stripMcpErrorPrefix(message: string): string {
  let current = message;
  while (MCP_ERROR_PREFIX.test(current)) {
    current = current.replace(MCP_ERROR_PREFIX, '');
  }
  return current;
}

/** Safe, client-facing message: no stack traces, URLs, upstream bodies or secrets. */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return 'Invalid input: ' + error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
  }
  if (error instanceof ApiError) {
    if (error.statusCode === 404) return 'Not found: no pool with that id';
    if (error.statusCode === 408) return 'Request to the risk API timed out';
    if (error.statusCode === 0) return 'Risk API is unreachable';
    if (error.statusCode && error.statusCode >= 500) return 'Risk API server error';
    return `Risk API rejected the request (HTTP ${error.statusCode})`;
  }
  if (error instanceof Error && error.message.startsWith('Unknown tool:')) return error.message;
  if (error instanceof Error) {
    const stripped = stripMcpErrorPrefix(error.message);
    if (stripped && stripped !== error.message) return stripped;
  }
  return 'Internal error';
}

export function toolErrorResult(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: safeErrorMessage(error) }] };
}

export async function listPoolsTool(
  apiClient: ApiClient,
  args: Record<string, unknown>
) {
  const validated = listPoolsInputSchema.parse(args);
  const result = await apiClient.listPools(validated);

  const summary = `Found ${result.data.length} pools (${result.pagination.total} total). ` +
    `Showing results ${validated.offset + 1}-${validated.offset + result.data.length}.`;

  const poolsList = result.data.map((pool) => ({
    pool_id: pool.pool_id,
    protocol: pool.protocol,
    chain: pool.chain,
    asset: pool.asset_symbol,
    tvl_usd: pool.tvl_usd,
    apy: pool.apy,
    risk_score: pool.total_risk_score,
    risk_category: pool.risk_category,
    is_stablecoin: pool.is_stablecoin,
  }));

  return {
    content: [
      { type: 'text' as const, text: summary },
      { type: 'text' as const, text: JSON.stringify({ pools: poolsList, pagination: result.pagination }, null, 2) },
    ],
  };
}

export async function getPoolRiskTool(
  apiClient: ApiClient,
  args: Record<string, unknown>
) {
  const validated = getPoolRiskInputSchema.parse(args);
  const pool = await apiClient.getPoolRisk(validated.pool_id);

  const summary =
    `Pool: ${pool.protocol} ${pool.asset_symbol} on ${pool.chain}\n` +
    `Risk Score: ${pool.risk_score?.total_risk_score != null ? pool.risk_score.total_risk_score.toFixed(2) : 'N/A'} ` +
    `(${pool.risk_score?.risk_category ?? 'unknown'})\n` +
    `TVL: $${pool.tvl_usd?.toLocaleString() ?? 'N/A'} | ` +
    `APY: ${pool.apy?.toFixed(2) ?? 'N/A'}%`;

  const signals = pool.risk_score
    ? {
        tvl_score: pool.risk_score.tvl_score,
        tvl_volatility_score: pool.risk_score.tvl_volatility_score,
        apy_volatility_score: pool.risk_score.apy_volatility_score,
        reward_ratio_score: pool.risk_score.reward_ratio_score,
        stablecoin_score: pool.risk_score.stablecoin_score,
        il_score: pool.risk_score.il_score,
        data_age_score: pool.risk_score.data_age_score,
        vault_score: pool.risk_score.vault_score,
        is_anomaly: pool.risk_score.is_anomaly,
        anomaly_reason: pool.risk_score.anomaly_reason,
      }
    : null;

  const history = await apiClient.getPoolHistory(validated.pool_id, 7);
  const historyWindow = history.map((h) => ({
    snapshot_at: h.snapshot_at,
    tvl_usd: h.tvl_usd,
    apy: h.apy,
  }));

  return {
    content: [
      { type: 'text' as const, text: summary },
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            pool_id: pool.pool_id,
            protocol: pool.protocol,
            chain: pool.chain,
            asset: pool.asset_symbol,
            is_stablecoin: pool.is_stablecoin,
            tvl_usd: pool.tvl_usd,
            apy: pool.apy,
            signals,
            history_window: historyWindow,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function comparePoolsTool(
  apiClient: ApiClient,
  args: Record<string, unknown>
) {
  const validated = comparePoolsInputSchema.parse(args);

  const pools = await Promise.all(
    validated.pool_ids.map((id) => apiClient.getPoolRisk(id))
  );

  const comparison = pools.map((pool) => ({
    pool_id: pool.pool_id,
    protocol: pool.protocol,
    chain: pool.chain,
    asset: pool.asset_symbol,
    tvl_usd: pool.tvl_usd,
    apy: pool.apy,
    risk_score: pool.risk_score?.total_risk_score,
    risk_category: pool.risk_score?.risk_category,
    is_stablecoin: pool.is_stablecoin,
  }));

  comparison.sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));

  const summary =
    `Comparing ${pools.length} pools:\n` +
    comparison
      .map(
        (p, i) =>
          `${i + 1}. ${p.protocol} ${p.asset} (${p.chain}): ` +
          `Risk ${p.risk_score?.toFixed(2) ?? 'N/A'}, ` +
          `TVL $${p.tvl_usd?.toLocaleString() ?? 'N/A'}, ` +
          `APY ${p.apy?.toFixed(2) ?? 'N/A'}%`
      )
      .join('\n');

  return {
    content: [
      { type: 'text' as const, text: summary },
      { type: 'text' as const, text: JSON.stringify({ comparison }, null, 2) },
    ],
  };
}

export async function explainPoolRiskTool(
  apiClient: ApiClient,
  args: Record<string, unknown>,
  llmApiKey?: string
) {
  const validated = explainPoolRiskInputSchema.parse(args);
  const explanation = await apiClient.explainPoolRisk(validated.pool_id, llmApiKey);

  const fallbackNote = explanation.metadata.fallback
    ? `\n\n⚠️  Note: Using fallback explanation (${explanation.metadata.fallback_reason})`
    : '';

  const summary =
    `Risk Explanation for Pool ${validated.pool_id}\n\n` +
    `${explanation.explanation.summary}\n\n` +
    `Key Factors:\n` +
    explanation.explanation.key_factors
      .map((f) => `- ${f.signal}: ${f.value}\n  ${f.explanation}`)
      .join('\n\n') +
    `\n\n${explanation.explanation.disclaimer}` +
    fallbackNote;

  return {
    content: [
      { type: 'text' as const, text: summary },
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            explanation: explanation.explanation,
            metadata: explanation.metadata,
            cached: explanation.cached,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function getVaultInfoTool(apiClient: ApiClient) {
  const vaultState = await apiClient.getVaultInfo();

  if (!vaultState) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Vault information is not available (vault may not be deployed or API does not support this endpoint).',
        },
      ],
    };
  }

  const summary =
    `Vault State (ERC-4626)\n` +
    `Address: ${vaultState.vault_address}\n` +
    `Chain ID: ${vaultState.chain_id}\n` +
    `Total Assets: ${vaultState.total_assets}\n` +
    `Total Supply: ${vaultState.total_supply}\n` +
    `Share Price: ${vaultState.share_price.toFixed(6)}\n` +
    `Block: ${vaultState.block_number}`;

  return {
    content: [
      { type: 'text' as const, text: summary },
      { type: 'text' as const, text: JSON.stringify(vaultState, null, 2) },
    ],
  };
}
