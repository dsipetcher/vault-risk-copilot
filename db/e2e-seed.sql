-- E2E Test Seed Data
-- Provides deterministic pool data for Playwright tests

-- Clear existing data
TRUNCATE pool_snapshots, risk_scores CASCADE;

-- Insert test pool snapshots (3 pools with different risk levels)

-- Pool 1: High Risk - High APY, low TVL
INSERT INTO pool_snapshots (
  pool_id, 
  protocol, 
  chain, 
  pool_name, 
  asset_symbol, 
  is_stablecoin,
  tvl_usd,
  tvl_change_7d_pct,
  apy,
  apy_base,
  apy_reward,
  apy_sigma,
  apy_pct_7d,
  il_risk,
  count,
  data_source,
  snapshot_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'test-protocol-high',
  'Ethereum',
  'High Risk Test Pool',
  'USDC',
  false,
  500000, -- Low TVL
  -15.5, -- Dropping TVL
  25.5, -- High APY
  10.0,
  15.5,
  8.5, -- High volatility
  null,
  0.0,
  30,
  'e2e-test',
  NOW()
);

-- Pool 2: Medium Risk - Moderate metrics
INSERT INTO pool_snapshots (
  pool_id,
  protocol,
  chain,
  pool_name,
  asset_symbol,
  is_stablecoin,
  tvl_usd,
  tvl_change_7d_pct,
  apy,
  apy_base,
  apy_reward,
  apy_sigma,
  apy_pct_7d,
  il_risk,
  count,
  data_source,
  snapshot_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'aave-v3',
  'Ethereum',
  'Medium Risk USDC Pool',
  'USDC',
  true,
  5000000, -- Medium TVL
  2.3,
  8.5, -- Moderate APY
  6.0,
  2.5,
  3.2,
  null,
  0.0,
  90,
  'e2e-test',
  NOW()
);

-- Pool 3: Low Risk - Stable, high TVL
INSERT INTO pool_snapshots (
  pool_id,
  protocol,
  chain,
  pool_name,
  asset_symbol,
  is_stablecoin,
  tvl_usd,
  tvl_change_7d_pct,
  apy,
  apy_base,
  apy_reward,
  apy_sigma,
  apy_pct_7d,
  il_risk,
  count,
  data_source,
  snapshot_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'compound-v3',
  'Ethereum',
  'Low Risk Stablecoin Pool',
  'DAI',
  true,
  50000000, -- High TVL
  0.5,
  4.2, -- Low APY
  4.0,
  0.2,
  0.8, -- Low volatility
  null,
  0.0,
  365,
  'e2e-test',
  NOW()
);

-- Compute risk scores for seeded pools
-- Pool 1: High risk
INSERT INTO risk_scores (
  pool_id,
  snapshot_id,
  total_risk_score,
  risk_category,
  tvl_score,
  tvl_volatility_score,
  apy_volatility_score,
  reward_ratio_score,
  stablecoin_score,
  il_score,
  data_age_score,
  vault_score,
  is_anomaly,
  anomaly_reason,
  model_version,
  calculated_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM pool_snapshots WHERE pool_id = '11111111-1111-1111-1111-111111111111' LIMIT 1),
  72.5,
  'high',
  85.0, -- Low TVL = high score
  75.0, -- Dropping TVL
  90.0, -- High volatility
  60.0, -- High reward ratio
  50.0, -- Not stablecoin
  0.0,  -- No IL risk
  40.0, -- Decent data count
  50.0, -- No vault
  false,
  null,
  '1.0',
  NOW()
);

-- Pool 2: Medium risk
INSERT INTO risk_scores (
  pool_id,
  snapshot_id,
  total_risk_score,
  risk_category,
  tvl_score,
  tvl_volatility_score,
  apy_volatility_score,
  reward_ratio_score,
  stablecoin_score,
  il_score,
  data_age_score,
  vault_score,
  is_anomaly,
  anomaly_reason,
  model_version,
  calculated_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  (SELECT id FROM pool_snapshots WHERE pool_id = '22222222-2222-2222-2222-222222222222' LIMIT 1),
  45.3,
  'medium',
  55.0,
  30.0,
  45.0,
  35.0,
  25.0, -- Stablecoin = lower score
  0.0,
  15.0, -- Good data count
  50.0,
  false,
  null,
  '1.0',
  NOW()
);

-- Pool 3: Low risk
INSERT INTO risk_scores (
  pool_id,
  snapshot_id,
  total_risk_score,
  risk_category,
  tvl_score,
  tvl_volatility_score,
  apy_volatility_score,
  reward_ratio_score,
  stablecoin_score,
  il_score,
  data_age_score,
  vault_score,
  is_anomaly,
  anomaly_reason,
  model_version,
  calculated_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  (SELECT id FROM pool_snapshots WHERE pool_id = '33333333-3333-3333-3333-333333333333' LIMIT 1),
  22.8,
  'low',
  15.0, -- High TVL = low score
  20.0,
  15.0,
  25.0,
  20.0, -- Stablecoin
  0.0,
  0.0, -- Excellent data count
  50.0,
  false,
  null,
  '1.0',
  NOW()
);
