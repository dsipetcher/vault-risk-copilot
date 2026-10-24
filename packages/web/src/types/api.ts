export interface Pool {
  id: number;
  pool_id: string;
  protocol: string;
  chain: string;
  pool_name: string | null;
  asset_symbol: string;
  is_stablecoin: boolean;
  tvl_usd: number | null;
  tvl_change_7d_pct: number | null;
  apy: number | null;
  apy_base: number | null;
  apy_reward: number | null;
  apy_sigma: number | null;
  apy_pct_7d: number | null;
  il_risk: number | null;
  count: number | null;
  snapshot_at: string;
  created_at: string;
  total_risk_score?: number;
  risk_category?: 'low' | 'medium' | 'high' | 'critical';
}

export interface PoolRiskScore {
  id: number;
  pool_id: string;
  snapshot_id: number;
  total_risk_score: number;
  risk_category: 'low' | 'medium' | 'high' | 'critical';
  tvl_score: number;
  tvl_volatility_score: number;
  apy_volatility_score: number;
  reward_ratio_score: number;
  stablecoin_score: number;
  il_score: number;
  data_age_score: number;
  vault_score: number;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  model_version: string;
  calculated_at: string;
  created_at: string;
}

export interface PoolDetail extends Pool {
  risk_score?: PoolRiskScore;
}

export interface PoolHistory {
  timestamp: string;
  tvl_usd: number;
  apy: number;
  score?: number;
}

export interface VaultState {
  vault_address: string;
  chain_id: number;
  total_assets: string;
  total_supply: string;
  share_price: number;
  block_number: number;
  snapshot_at: string;
}

export interface ApiError {
  error: string;
  message?: string;
}
