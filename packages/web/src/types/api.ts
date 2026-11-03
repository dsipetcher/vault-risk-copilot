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

export interface RiskFactor {
  signal: string;
  value: string;
  explanation: string;
}

export interface ExplanationOutput {
  summary: string;
  key_factors: RiskFactor[];
  disclaimer: string;
}

export interface ExplanationMetadata {
  provider: string;
  model: string;
  timestamp: string;
  latency_ms: number | null;
  fallback?: boolean;
  fallback_reason?: string;
}

export interface ExplanationResponse {
  explanation: ExplanationOutput;
  metadata: ExplanationMetadata;
  cached: boolean;
}

export type LLMProvider = 'mock' | 'openai' | 'openrouter' | 'groq' | 'ollama';

export interface HyperliquidSignal {
  id: string;
  label: string;
  score: number | null;
  value: string;
  explanation: string;
  applicable: boolean;
}

export interface HyperliquidRisk {
  total_risk_score: number;
  risk_category: 'low' | 'medium' | 'high' | 'critical';
  model_version: string;
  signals: {
    funding_extreme: HyperliquidSignal;
    funding_volatility: HyperliquidSignal;
    oi_concentration: HyperliquidSignal;
    mark_oracle_deviation: HyperliquidSignal;
  };
}

export interface HyperliquidMarket {
  coin: string;
  sz_decimals: number | null;
  max_leverage: number | null;
  only_isolated: boolean;
  is_delisted: boolean;
  funding_rate: number | null;
  open_interest: number | null;
  mark_px: number | null;
  oracle_px: number | null;
  mid_px: number | null;
  premium: number | null;
  prev_day_px: number | null;
  day_ntl_vlm: number | null;
  day_base_vlm: number | null;
  oi_usd: number | null;
  funding_annualized_pct: number | null;
  mark_oracle_deviation_pct: number | null;
  snapshot_at: string;
  risk: HyperliquidRisk;
}

export interface HyperliquidMarketsPage {
  data: HyperliquidMarket[];
  pagination: { total: number; limit: number; offset: number };
  snapshot_at: string | null;
  source: 'snapshot';
}

export interface HyperliquidFundingPoint {
  time: number;
  funding_rate: number;
  premium: number | null;
  annualized_pct: number;
}

export interface HyperliquidFundingHistory {
  coin: string;
  points: HyperliquidFundingPoint[];
  source: 'live';
  cached: boolean;
}

export interface LLMSettings {
  provider: LLMProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  rememberKey: boolean;
}
