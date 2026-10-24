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
}

export async function recomputeRisk(poolId: string, force: boolean = false): Promise<RiskRecomputeResponse> {
  const url = `${env.RISK_SERVICE_URL}/risk/recompute/${poolId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(`Risk service error: ${(error as any).detail || response.statusText}`);
  }

  return response.json() as Promise<RiskRecomputeResponse>;
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
