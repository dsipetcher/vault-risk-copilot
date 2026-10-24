export interface Pool {
  id: string;
  protocol: string;
  symbol: string;
  chain: string;
  tvl_usd: number;
  apy: number;
  pool_meta: {
    ilRisk?: string;
    exposure?: string;
  };
  updated_at: string;
}

export interface PoolRiskScore {
  pool_id: string;
  score: number;
  category: 'low' | 'medium' | 'high' | 'critical';
  factors: {
    tvl_level: number;
    tvl_change: number;
    apy_volatility: number;
    reward_ratio: number;
    il_risk: number;
    anomaly_score: number;
  };
  computed_at: string;
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
  address: string;
  total_assets: string;
  total_supply: string;
  share_price: string;
  paused: boolean;
  updated_at: string;
}

export interface ApiError {
  error: string;
  message?: string;
}
