-- Vault Risk Copilot Database Schema
-- Migration 001: Initial schema for pool snapshots, risk scores, and explanations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Pool snapshots table: stores time-series data from DeFiLlama and on-chain reads
CREATE TABLE IF NOT EXISTS pool_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Pool identification
    pool_id VARCHAR(255) NOT NULL,  -- DeFiLlama pool UUID or custom identifier
    protocol VARCHAR(100) NOT NULL,  -- e.g., 'Aave', 'Compound', 'Uniswap'
    chain VARCHAR(50) NOT NULL,      -- e.g., 'Ethereum', 'Arbitrum'
    pool_name TEXT NOT NULL,
    pool_address VARCHAR(42),        -- Ethereum address (0x...)
    
    -- Asset information
    asset_symbol VARCHAR(20),        -- e.g., 'USDC', 'ETH'
    asset_address VARCHAR(42),
    is_stablecoin BOOLEAN DEFAULT false,
    
    -- TVL and volume
    tvl_usd DECIMAL(20, 2),          -- Total Value Locked in USD
    tvl_usd_7d_ago DECIMAL(20, 2),   -- TVL 7 days ago for trend calculation
    tvl_change_7d_pct DECIMAL(10, 4), -- Percentage change in TVL
    
    -- Yield metrics
    apy DECIMAL(10, 4),              -- Annual Percentage Yield (total)
    apy_base DECIMAL(10, 4),         -- Base APY (from protocol fees/interest)
    apy_reward DECIMAL(10, 4),       -- Reward APY (from token incentives)
    apy_7d DECIMAL(10, 4),           -- APY 7 days ago
    apy_pct_7d DECIMAL(10, 4),       -- 7-day APY change percentage
    
    -- Volatility and risk indicators
    apy_sigma DECIMAL(10, 6),        -- Standard deviation of APY (DeFiLlama)
    il_risk DECIMAL(10, 4),          -- Impermanent Loss risk (for AMM pools)
    
    -- Metadata
    count INTEGER,                   -- Number of data points (age indicator)
    data_source VARCHAR(50) NOT NULL, -- 'defillama' or 'onchain'
    
    -- Timestamps
    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT pool_snapshots_unique_snapshot UNIQUE (pool_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool_id ON pool_snapshots(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_snapshot_at ON pool_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_protocol_chain ON pool_snapshots(protocol, chain);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_tvl ON pool_snapshots(tvl_usd DESC NULLS LAST);

-- Risk scores table: stores calculated risk metrics
CREATE TABLE IF NOT EXISTS risk_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to pool snapshot
    pool_id VARCHAR(255) NOT NULL,
    snapshot_id UUID REFERENCES pool_snapshots(id) ON DELETE CASCADE,
    
    -- Risk score components (explainable features)
    tvl_score DECIMAL(5, 2),           -- Score based on TVL level (0-100)
    tvl_volatility_score DECIMAL(5, 2), -- Score based on TVL changes
    apy_volatility_score DECIMAL(5, 2), -- Score based on APY fluctuations
    reward_ratio_score DECIMAL(5, 2),   -- Score based on apy_reward/apy ratio
    stablecoin_score DECIMAL(5, 2),     -- Lower risk for stablecoins
    il_score DECIMAL(5, 2),             -- Impermanent loss risk score
    data_age_score DECIMAL(5, 2),       -- Score based on data history length
    vault_score DECIMAL(5, 2),          -- Vault share price drop risk
    
    -- Aggregate risk score
    total_risk_score DECIMAL(5, 2) NOT NULL, -- Weighted sum of component scores (0-100)
    risk_category VARCHAR(20) NOT NULL,      -- 'low', 'medium', 'high', 'critical'
    
    -- Anomaly detection
    is_anomaly BOOLEAN DEFAULT false,
    anomaly_reason TEXT,
    
    -- Model metadata
    model_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT risk_scores_unique_calculation UNIQUE (pool_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_pool_id ON risk_scores(pool_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_total_risk ON risk_scores(total_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_calculated_at ON risk_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_anomaly ON risk_scores(is_anomaly) WHERE is_anomaly = true;

-- LLM explanations table: stores AI-generated risk explanations
CREATE TABLE IF NOT EXISTS explanations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to risk score
    risk_score_id UUID REFERENCES risk_scores(id) ON DELETE CASCADE,
    pool_id VARCHAR(255) NOT NULL,
    
    -- LLM output
    explanation_text TEXT NOT NULL,    -- Plain language explanation
    risk_factors JSONB,                -- Structured risk factors (validated schema)
    
    -- LLM metadata
    model_name VARCHAR(100) NOT NULL,  -- e.g., 'gpt-4', 'claude-3-opus'
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    cost_usd DECIMAL(10, 6),
    
    -- Validation
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    validation_errors JSONB,           -- Any schema validation issues
    
    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT explanations_unique_per_risk UNIQUE (risk_score_id)
);

CREATE INDEX IF NOT EXISTS idx_explanations_pool_id ON explanations(pool_id);
CREATE INDEX IF NOT EXISTS idx_explanations_generated_at ON explanations(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_explanations_model ON explanations(model_name);

-- Vault state snapshots: on-chain state of our SimpleVault contract
CREATE TABLE IF NOT EXISTS vault_state_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Vault identification
    vault_address VARCHAR(42) NOT NULL,
    chain VARCHAR(50) NOT NULL DEFAULT 'Sepolia',
    
    -- ERC-4626 state
    total_assets NUMERIC(78, 0) NOT NULL,  -- uint256 from contract
    total_supply NUMERIC(78, 0) NOT NULL,  -- Total shares issued
    share_price DECIMAL(30, 18),           -- totalAssets / totalSupply
    
    -- Vault configuration
    deposit_cap NUMERIC(78, 0),
    is_paused BOOLEAN DEFAULT false,
    owner_address VARCHAR(42),
    
    -- Derived metrics
    utilization_pct DECIMAL(5, 2),         -- (totalAssets / depositCap) * 100
    
    -- Timestamps
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT vault_state_unique_snapshot UNIQUE (vault_address, block_number)
);

CREATE INDEX IF NOT EXISTS idx_vault_state_address ON vault_state_snapshots(vault_address);
CREATE INDEX IF NOT EXISTS idx_vault_state_snapshot_at ON vault_state_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_state_block ON vault_state_snapshots(block_number DESC);

-- Comments for documentation
COMMENT ON TABLE pool_snapshots IS 'Time-series snapshots of DeFi pool data from external APIs and on-chain reads';
COMMENT ON TABLE risk_scores IS 'Calculated risk metrics for each pool snapshot using explainable features';
COMMENT ON TABLE explanations IS 'LLM-generated plain language explanations of risk scores';
COMMENT ON TABLE vault_state_snapshots IS 'On-chain state snapshots of SimpleVault contract on Sepolia';

COMMENT ON COLUMN risk_scores.total_risk_score IS 'Aggregate risk score (0-100): 0=safest, 100=highest risk';
COMMENT ON COLUMN pool_snapshots.count IS 'Number of historical data points; higher count = more reliable data';
COMMENT ON COLUMN explanations.risk_factors IS 'Structured JSON of risk factors matching zod schema validation';
