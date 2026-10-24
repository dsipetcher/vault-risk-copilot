export interface RiskScore {
  tvl_score: number | null;
  tvl_volatility_score: number | null;
  apy_volatility_score: number | null;
  reward_ratio_score: number | null;
  stablecoin_score: number | null;
  il_score: number | null;
  data_age_score: number | null;
  vault_score: number | null;
}

export interface ChartDataPoint {
  name: string;
  value: number;
}

export function prepareChartData(riskScore: RiskScore): ChartDataPoint[] {
  return [
    { name: 'TVL Score', value: riskScore.tvl_score },
    { name: 'TVL Volatility', value: riskScore.tvl_volatility_score },
    { name: 'APY Volatility', value: riskScore.apy_volatility_score },
    { name: 'Reward Ratio', value: riskScore.reward_ratio_score },
    { name: 'Stablecoin', value: riskScore.stablecoin_score },
    { name: 'IL Risk', value: riskScore.il_score },
    { name: 'Data Age', value: riskScore.data_age_score },
    { name: 'Vault Score', value: riskScore.vault_score },
  ]
    .filter((item): item is { name: string; value: number } => item.value !== null)
    .map(item => ({ ...item, value: Number(item.value) }));
}
