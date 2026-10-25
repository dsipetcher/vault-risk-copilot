import { env } from '../config.js';

export interface RiskRecomputeRequest {
  pool_id: string;
  force?: boolean;
}

export interface RiskRecomputeResponse {
  pool_id: string;
  status: 'success' | 'error';
  message?: string;
  risk_score?: number;
  computed?: number;
  skipped?: number;
  errors?: number;
}

function riskServiceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.RISK_INTERNAL_TOKEN) {
    headers['X-Internal-Token'] = env.RISK_INTERNAL_TOKEN;
  }
  return headers;
}

export async function recomputeRisk(poolId: string, force: boolean = false): Promise<RiskRecomputeResponse> {
  const url = `${env.RISK_SERVICE_URL}/recompute`;

  const response = await fetch(url, {
    method: 'POST',
    headers: riskServiceHeaders(),
    body: JSON.stringify({ pool_ids: [poolId], force }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const detail = (error as { detail?: string }).detail || response.statusText;
    throw new Error(`Risk service error: ${detail}`);
  }

  const data = (await response.json()) as {
    computed: number;
    skipped: number;
    errors: number;
    pool_ids: string[];
    elapsed_seconds: number;
  };

  return {
    pool_id: poolId,
    status: data.computed > 0 ? 'success' : 'error',
    message:
      data.computed > 0
        ? `Recomputed risk score for pool ${poolId}`
        : `No risk score computed for pool ${poolId}`,
    computed: data.computed,
    skipped: data.skipped,
    errors: data.errors,
  };
}

export async function checkRiskServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${env.RISK_SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
