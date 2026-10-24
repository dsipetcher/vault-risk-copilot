"""Unit tests for risk engine signal functions."""

from uuid import uuid4

import pytest

from app.risk_engine import (
    apy_volatility_signal,
    calculate_risk_score,
    compute_risk_scores_batch,
    data_age_signal,
    detect_anomaly_rule_based,
    il_risk_signal,
    reward_ratio_signal,
    stablecoin_signal,
    tvl_drop_signal,
    tvl_size_signal,
    vault_share_price_drop_signal,
)

# === TVL Size Signal Tests ===


@pytest.mark.unit
def test_tvl_size_signal_no_data():
    """TVL with no data should return maximum risk."""
    assert tvl_size_signal(None) == 100.0
    assert tvl_size_signal(0.0) == 100.0
    assert tvl_size_signal(-100.0) == 100.0


@pytest.mark.unit
def test_tvl_size_signal_boundaries():
    """TVL signal should handle boundary values correctly."""
    # Below low threshold (1M)
    assert tvl_size_signal(500_000.0) == 100.0

    # Above high threshold (10M)
    assert tvl_size_signal(15_000_000.0) == 0.0

    # At low boundary
    assert tvl_size_signal(1_000_000.0) == 100.0

    # At high boundary
    assert tvl_size_signal(10_000_000.0) == 0.0


@pytest.mark.unit
def test_tvl_size_signal_linear_interpolation():
    """TVL signal should interpolate linearly between thresholds."""
    # Midpoint (5.5M) should be 50% risk
    midpoint = (1_000_000.0 + 10_000_000.0) / 2
    score = tvl_size_signal(midpoint)
    assert 45.0 <= score <= 55.0  # Allow small floating point error


# === TVL Drop Signal Tests ===


@pytest.mark.unit
def test_tvl_drop_signal_no_data():
    """TVL drop with no data should return medium risk."""
    assert tvl_drop_signal(None) == 50.0


@pytest.mark.unit
def test_tvl_drop_signal_growth():
    """TVL growth or stability should return zero risk."""
    assert tvl_drop_signal(0.0) == 0.0
    assert tvl_drop_signal(10.0) == 0.0
    assert tvl_drop_signal(100.0) == 0.0


@pytest.mark.unit
def test_tvl_drop_signal_critical_drop():
    """TVL drop >= critical threshold should return 100."""
    assert tvl_drop_signal(-50.0) == 100.0
    assert tvl_drop_signal(-80.0) == 100.0


@pytest.mark.unit
def test_tvl_drop_signal_warning_range():
    """TVL drop in warning range should scale 50-100."""
    # Drop at warning threshold (20%) should be 50
    score_warning = tvl_drop_signal(-20.0)
    assert 48.0 <= score_warning <= 52.0

    # Drop between warning and critical should be 50-100
    score_mid = tvl_drop_signal(-35.0)
    assert 50.0 < score_mid < 100.0


# === APY Volatility Signal Tests ===


@pytest.mark.unit
def test_apy_volatility_signal_stable():
    """Stable APY should return low risk."""
    score = apy_volatility_signal(apy=5.0, apy_sigma=0.5, apy_pct_7d=2.0)
    assert score < 30.0


@pytest.mark.unit
def test_apy_volatility_signal_high_absolute():
    """APY >100% should trigger penalty."""
    score = apy_volatility_signal(apy=150.0, apy_sigma=5.0, apy_pct_7d=10.0)
    # APY 150% > 100% threshold: penalty = min(30, (150-100)/2) = 25
    # CV = 5/150 = 0.033 < 2.5: no penalty
    # Spike 10% < 100%: no penalty
    # Total ~25
    assert 20.0 < score < 30.0


@pytest.mark.unit
def test_apy_volatility_signal_high_sigma():
    """High APY sigma (coefficient of variation) should trigger penalty."""
    score = apy_volatility_signal(apy=10.0, apy_sigma=30.0, apy_pct_7d=5.0)
    # APY 10% < 100%: no penalty
    # CV = 30/10 = 3.0 > 2.5 threshold: penalty = min(35, (3.0-2.5)*10) = 5
    # Spike 5% < 100%: no penalty
    # Total ~5
    assert 0.0 < score < 10.0


@pytest.mark.unit
def test_apy_volatility_signal_spike():
    """Recent APY spike should trigger penalty."""
    score = apy_volatility_signal(apy=20.0, apy_sigma=2.0, apy_pct_7d=150.0)
    # APY 20% < 100%: no penalty
    # CV = 2/20 = 0.1 < 2.5: no penalty
    # Spike 150% > 100%: penalty = min(35, (150-100)/2) = 25
    # Total ~25
    assert 20.0 < score < 30.0


# === Reward Ratio Signal Tests ===


@pytest.mark.unit
def test_reward_ratio_signal_no_data():
    """No data should return medium risk."""
    assert reward_ratio_signal(None, None) == 50.0
    assert reward_ratio_signal(0.0, 5.0) == 50.0


@pytest.mark.unit
def test_reward_ratio_signal_low_dependency():
    """Low reward ratio should return low risk."""
    # 20% reward / 10% total = 0.2 ratio < 0.3 threshold
    assert reward_ratio_signal(apy=10.0, apy_reward=2.0) == 0.0


@pytest.mark.unit
def test_reward_ratio_signal_high_dependency():
    """High reward ratio should return high risk."""
    # 8% reward / 10% total = 0.8 ratio > 0.7 threshold
    assert reward_ratio_signal(apy=10.0, apy_reward=8.0) == 100.0


@pytest.mark.unit
def test_reward_ratio_signal_linear():
    """Reward ratio in middle range should interpolate."""
    # 5% reward / 10% total = 0.5 ratio (midpoint between 0.3 and 0.7)
    score = reward_ratio_signal(apy=10.0, apy_reward=5.0)
    assert 45.0 <= score <= 55.0


# === Stablecoin Signal Tests ===


@pytest.mark.unit
def test_stablecoin_signal():
    """Stablecoin flag should determine fixed risk."""
    assert stablecoin_signal(True) == 0.0
    assert stablecoin_signal(False) == 50.0


# === IL Risk Signal Tests ===


@pytest.mark.unit
def test_il_risk_signal_no_data():
    """No IL risk data should return zero (not an AMM)."""
    assert il_risk_signal(None) == 0.0


@pytest.mark.unit
def test_il_risk_signal_low():
    """Low IL risk should scale proportionally."""
    assert il_risk_signal(0.0) == 0.0
    assert il_risk_signal(0.25) == 25.0


@pytest.mark.unit
def test_il_risk_signal_high():
    """IL risk above threshold should return 100."""
    assert il_risk_signal(0.5) == 100.0
    assert il_risk_signal(1.0) == 100.0


# === Data Age Signal Tests ===


@pytest.mark.unit
def test_data_age_signal_no_data():
    """No data count should return maximum risk."""
    assert data_age_signal(None) == 100.0


@pytest.mark.unit
def test_data_age_signal_reliable():
    """Data count >= min should return zero risk."""
    assert data_age_signal(30) == 0.0
    assert data_age_signal(100) == 0.0


@pytest.mark.unit
def test_data_age_signal_unreliable():
    """Data count < warning should return 100."""
    assert data_age_signal(5) == 100.0
    assert data_age_signal(7) == 100.0


@pytest.mark.unit
def test_data_age_signal_linear():
    """Data count between warning and min should interpolate."""
    # Midpoint between 7 (warning) and 30 (min) = ~18.5
    score = data_age_signal(18)
    assert 40.0 <= score <= 60.0


# === Vault Share Price Drop Signal Tests ===


@pytest.mark.unit
def test_vault_share_price_drop_signal_no_data():
    """No vault data should return medium risk."""
    assert vault_share_price_drop_signal(None) == 50.0


@pytest.mark.unit
def test_vault_share_price_drop_signal_stable():
    """Stable or growing share price should return zero risk."""
    assert vault_share_price_drop_signal(0.0) == 0.0
    assert vault_share_price_drop_signal(5.0) == 0.0


@pytest.mark.unit
def test_vault_share_price_drop_signal_critical():
    """Share price drop >=5% should return 100."""
    assert vault_share_price_drop_signal(-5.0) == 100.0
    assert vault_share_price_drop_signal(-10.0) == 100.0


@pytest.mark.unit
def test_vault_share_price_drop_signal_warning():
    """Share price drop in warning range should scale 0-100."""
    # Drop at warning threshold (1%) should be ~50
    score_warning = vault_share_price_drop_signal(-1.0)
    assert 48.0 <= score_warning <= 52.0

    # Drop between warning and critical should be 50-100
    score_mid = vault_share_price_drop_signal(-3.0)
    assert 50.0 < score_mid < 100.0


# === Anomaly Detection Tests (Rule-Based) ===


@pytest.mark.unit
def test_detect_anomaly_rule_based_normal():
    """Normal pool should not be flagged as anomaly."""
    breakdown = {
        "tvl_score": 20.0,
        "tvl_volatility_score": 10.0,
        "apy_volatility_score": 15.0,
        "reward_ratio_score": 25.0,
        "stablecoin_score": 0.0,
        "il_score": 10.0,
        "data_age_score": 5.0,
        "vault_score": 10.0,
    }
    is_anomaly, reason = detect_anomaly_rule_based(30.0, breakdown)
    assert not is_anomaly
    assert reason is None


@pytest.mark.unit
def test_detect_anomaly_rule_based_multiple_critical():
    """Multiple signals >=90 should trigger anomaly."""
    breakdown = {
        "tvl_score": 95.0,
        "tvl_volatility_score": 92.0,
        "apy_volatility_score": 91.0,
        "reward_ratio_score": 20.0,
        "stablecoin_score": 50.0,
        "il_score": 10.0,
        "data_age_score": 5.0,
        "vault_score": 10.0,
    }
    is_anomaly, reason = detect_anomaly_rule_based(80.0, breakdown)
    assert is_anomaly
    assert "3 signals in critical range" in reason


# === Calculate Risk Score Tests ===


@pytest.mark.unit
def test_calculate_risk_score_complete():
    """Calculate risk score with complete data."""
    snapshot = {
        "id": uuid4(),
        "pool_id": "test_pool",
        "tvl_usd": 5_000_000.0,
        "tvl_change_7d_pct": -10.0,
        "apy": 15.0,
        "apy_sigma": 2.0,
        "apy_pct_7d": 5.0,
        "apy_reward": 3.0,
        "is_stablecoin": True,
        "il_risk": 0.1,
        "count": 50,
        "vault_share_price_change_pct": -0.5,
    }

    result = calculate_risk_score(snapshot)

    assert "pool_id" in result
    assert result["pool_id"] == "test_pool"
    assert "total_risk_score" in result
    assert 0.0 <= result["total_risk_score"] <= 100.0
    assert "risk_category" in result
    assert result["risk_category"] in ["low", "medium", "high", "critical"]
    assert "tvl_score" in result
    assert "vault_score" in result
    assert "model_version" in result


@pytest.mark.unit
def test_calculate_risk_score_low_risk():
    """Calculate risk score for low-risk pool."""
    snapshot = {
        "id": uuid4(),
        "pool_id": "safe_pool",
        "tvl_usd": 50_000_000.0,  # High TVL
        "tvl_change_7d_pct": 5.0,  # Growing
        "apy": 8.0,  # Moderate
        "apy_sigma": 0.5,  # Stable
        "apy_pct_7d": 2.0,  # No spike
        "apy_reward": 1.0,  # Low reward dependency
        "is_stablecoin": True,  # Stablecoin
        "il_risk": 0.0,  # No IL
        "count": 100,  # Reliable data
        "vault_share_price_change_pct": 0.1,  # Stable vault
    }

    result = calculate_risk_score(snapshot)

    assert result["total_risk_score"] < 30.0
    assert result["risk_category"] in ["low", "medium"]


@pytest.mark.unit
def test_calculate_risk_score_high_risk():
    """Calculate risk score for high-risk pool."""
    snapshot = {
        "id": uuid4(),
        "pool_id": "risky_pool",
        "tvl_usd": 100_000.0,  # Low TVL
        "tvl_change_7d_pct": -60.0,  # Sharp drop
        "apy": 200.0,  # Extremely high
        "apy_sigma": 50.0,  # Very volatile
        "apy_pct_7d": 150.0,  # Recent spike
        "apy_reward": 180.0,  # High reward dependency
        "is_stablecoin": False,  # Volatile asset
        "il_risk": 0.8,  # High IL
        "count": 5,  # New pool
        "vault_share_price_change_pct": -8.0,  # Vault losing value
    }

    result = calculate_risk_score(snapshot)

    assert result["total_risk_score"] > 70.0
    assert result["risk_category"] in ["high", "critical"]


# === Batch Computation Tests ===


@pytest.mark.unit
def test_compute_risk_scores_batch_empty():
    """Batch computation with empty input should return empty list."""
    result = compute_risk_scores_batch([])
    assert result == []


@pytest.mark.unit
def test_compute_risk_scores_batch():
    """Batch computation should process multiple pools."""
    snapshots = []
    for i in range(15):
        snapshots.append(
            {
                "id": uuid4(),
                "pool_id": f"pool_{i}",
                "tvl_usd": 5_000_000.0,
                "tvl_change_7d_pct": 0.0,
                "apy": 10.0,
                "apy_sigma": 1.0,
                "apy_pct_7d": 2.0,
                "apy_reward": 2.0,
                "is_stablecoin": True,
                "il_risk": 0.0,
                "count": 50,
                "vault_share_price_change_pct": 0.0,
            }
        )

    result = compute_risk_scores_batch(snapshots)

    assert len(result) == 15
    assert all("pool_id" in score for score in result)
    assert all("is_anomaly" in score for score in result)
    assert all("vault_score" in score for score in result)
    assert all("total_risk_score" in score for score in result)
