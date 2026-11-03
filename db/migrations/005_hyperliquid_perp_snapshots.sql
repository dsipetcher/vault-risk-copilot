-- Migration 005: Hyperliquid perpetual market snapshots (read-only public Info API)

CREATE TABLE IF NOT EXISTS hyperliquid_perp_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    coin VARCHAR(32) NOT NULL,
    sz_decimals INTEGER,
    max_leverage INTEGER,
    only_isolated BOOLEAN NOT NULL DEFAULT false,
    is_delisted BOOLEAN NOT NULL DEFAULT false,

    -- Hourly funding as a decimal (e.g. 0.0000125 = 0.00125% per hour)
    funding_rate NUMERIC,
    -- Open interest in coin units (not USD)
    open_interest NUMERIC,
    mark_px NUMERIC,
    oracle_px NUMERIC,
    mid_px NUMERIC,
    premium NUMERIC,
    prev_day_px NUMERIC,
    -- 24h notional volume (USD) and base-asset volume
    day_ntl_vlm NUMERIC,
    day_base_vlm NUMERIC,

    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT hyperliquid_perp_unique_snapshot UNIQUE (coin, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_hl_perp_snapshot_at
    ON hyperliquid_perp_snapshots (snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_hl_perp_coin_snapshot
    ON hyperliquid_perp_snapshots (coin, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_hl_perp_delisted
    ON hyperliquid_perp_snapshots (is_delisted, snapshot_at DESC);

COMMENT ON TABLE hyperliquid_perp_snapshots IS
    'Periodic snapshots of Hyperliquid perp markets from the public Info API (no auth, no trading)';
COMMENT ON COLUMN hyperliquid_perp_snapshots.funding_rate IS
    'Hourly funding rate as a decimal; annualized percent ≈ funding_rate * 24 * 365 * 100';
COMMENT ON COLUMN hyperliquid_perp_snapshots.open_interest IS
    'Open interest in coin units; USD notional ≈ open_interest * mark_px';
