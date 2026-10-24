"""Risk scoring engine with transparent, explainable signals."""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import numpy as np
from sklearn.ensemble import IsolationForest

from app.config import settings
from app.models import RiskCategory

logger = logging.getLogger(__name__)


def decimal_to_float(value: Decimal | None) -> float | None:
    """Safely convert Decimal to float."""
    return float(value) if value is not None else None


# === Individual Signal Functions ===


def tvl_size_signal(tvl_usd: float | None) -> float:
    """
    Calculate risk score based on TVL size.

    Rationale: Larger TVL = more liquidity, harder to manipulate, more battle-tested.
    Small TVL pools are riskier.

    Formula:
    - TVL < low_threshold: 100 (highest risk)
    - TVL > medium_threshold: 0 (lowest risk)
    - Linear interpolation between thresholds

    Args:
        tvl_usd: Total Value Locked in USD

    Returns:
        Risk score (0-100): 0 = low risk, 100 = high risk
    """
    if tvl_usd is None or tvl_usd <= 0:
        return 100.0  # No TVL data = maximum risk

    low = settings.thresholds.tvl_low_threshold
    high = settings.thresholds.tvl_medium_threshold

    if tvl_usd >= high:
        return 0.0
    if tvl_usd <= low:
        return 100.0

    # Linear interpolation
    score = 100.0 * (1 - (tvl_usd - low) / (high - low))
    return max(0.0, min(100.0, score))


def tvl_drop_signal(tvl_change_7d_pct: float | None) -> float:
    """
    Calculate risk score based on TVL 7-day change.

    Rationale: Sharp TVL drops indicate capital flight, loss of confidence,
    or protocol issues. Gradual decreases are less alarming than sudden drops.

    Formula:
    - No drop or increase: 0
    - Drop < warning threshold: linear scaling 0-50
    - Drop >= warning threshold: 50
    - Drop >= critical threshold: 100

    Args:
        tvl_change_7d_pct: TVL change percentage over 7 days (negative = drop)

    Returns:
        Risk score (0-100)
    """
    if tvl_change_7d_pct is None:
        return 50.0  # No data = medium risk

    if tvl_change_7d_pct >= 0:
        return 0.0  # TVL growing or stable = no risk

    drop_magnitude = abs(tvl_change_7d_pct)
    warning = settings.thresholds.tvl_drop_warning_pct
    critical = settings.thresholds.tvl_drop_critical_pct

    if drop_magnitude >= critical:
        return 100.0
    if drop_magnitude >= warning:
        # Scale from 50 to 100 between warning and critical
        ratio = (drop_magnitude - warning) / (critical - warning)
        return 50.0 + 50.0 * ratio
    # Scale from 0 to 50 between 0 and warning
    return 50.0 * (drop_magnitude / warning)


def apy_volatility_signal(
    apy: float | None,
    apy_sigma: float | None,
    apy_pct_7d: float | None,
) -> float:
    """
    Calculate risk score based on APY volatility and recent spikes.

    Rationale: Extremely volatile or spiking APY suggests:
    - Temporary incentive programs (unsustainable)
    - Low liquidity (rates swing wildly)
    - Manipulation or oracle issues

    Formula:
    - Checks both historical volatility (sigma) and recent 7d change
    - High APY (>100%) gets automatic penalty
    - Z-score outlier detection for historical volatility
    - Recent spike detection for 7d change

    Args:
        apy: Current APY (%)
        apy_sigma: Standard deviation of APY
        apy_pct_7d: APY 7-day percentage change

    Returns:
        Risk score (0-100)
    """
    score = 0.0

    # Check absolute APY level
    if apy is not None and apy > settings.thresholds.apy_high_absolute:
        # APY >100% is suspicious
        excess = apy - settings.thresholds.apy_high_absolute
        score += min(30.0, excess / 2.0)  # Cap at 30 points

    # Check historical volatility (sigma)
    if apy is not None and apy_sigma is not None and apy > 0:
        # Z-score: sigma / mean (coefficient of variation)
        cv = apy_sigma / apy if apy > 0 else 0
        z_threshold = settings.thresholds.apy_outlier_z_score
        if cv > z_threshold:
            # High coefficient of variation = unstable
            score += min(35.0, (cv - z_threshold) * 10)  # Cap at 35 points

    # Check recent spike
    if apy_pct_7d is not None:
        spike_abs = abs(apy_pct_7d)
        spike_threshold = settings.thresholds.apy_spike_threshold_pct
        if spike_abs > spike_threshold:
            # Recent spike (up or down) = unstable
            excess_spike = spike_abs - spike_threshold
            score += min(35.0, excess_spike / 2.0)  # Cap at 35 points

    return min(100.0, score)


def reward_ratio_signal(
    apy: float | None,
    apy_reward: float | None,
) -> float:
    """
    Calculate risk score based on reward APY / total APY ratio.

    Rationale: High reward/total APY ratio means yield is heavily dependent
    on external token incentives. If incentives stop, APY drops sharply.
    Base APY (from protocol fees) is more sustainable.

    Formula:
    - Ratio < low threshold: 0 (sustainable)
    - Ratio > high threshold: 100 (highly dependent)
    - Linear interpolation between thresholds

    Args:
        apy: Total APY (%)
        apy_reward: Reward APY component (%)

    Returns:
        Risk score (0-100)
    """
    if apy is None or apy_reward is None or apy <= 0:
        return 50.0  # No data = medium risk

    reward_ratio = apy_reward / apy
    low = settings.thresholds.reward_ratio_low
    high = settings.thresholds.reward_ratio_high

    if reward_ratio <= low:
        return 0.0
    if reward_ratio >= high:
        return 100.0

    # Linear interpolation
    score = 100.0 * (reward_ratio - low) / (high - low)
    return max(0.0, min(100.0, score))


def stablecoin_signal(is_stablecoin: bool) -> float:
    """
    Calculate risk score based on asset type.

    Rationale: Stablecoin pools have lower price volatility risk.
    Volatile asset pools can experience sharp price swings.

    Formula:
    - Stablecoin: 0
    - Volatile asset: 50

    Args:
        is_stablecoin: True if pool is stablecoin-based

    Returns:
        Risk score (0-100)
    """
    return 0.0 if is_stablecoin else 50.0


def il_risk_signal(il_risk: float | None) -> float:
    """
    Calculate risk score based on impermanent loss risk.

    Rationale: AMM pools with volatile assets can experience IL.
    DeFiLlama provides an IL risk score; we normalize it.

    Formula:
    - IL risk score (0-1 scale) → 0-100 scale
    - Above threshold: 100

    Args:
        il_risk: Impermanent loss risk score (0-1)

    Returns:
        Risk score (0-100)
    """
    if il_risk is None:
        return 0.0  # No IL risk data (likely not an AMM)

    threshold = settings.thresholds.il_risk_threshold
    if il_risk >= threshold:
        return 100.0

    # Scale 0-threshold to 0-100
    return min(100.0, il_risk * 100.0)


def data_age_signal(count: int | None) -> float:
    """
    Calculate risk score based on data history length.

    Rationale: Pools with short data history are less tested,
    more likely to be new/experimental, harder to assess.

    Formula:
    - count >= min_count: 0 (reliable data)
    - count < warning_count: 100 (very unreliable)
    - Linear interpolation between warning and min

    Args:
        count: Number of historical data points

    Returns:
        Risk score (0-100)
    """
    if count is None:
        return 100.0  # No count data = maximum risk

    min_count = settings.thresholds.data_min_count
    warning_count = settings.thresholds.data_warning_count

    if count >= min_count:
        return 0.0
    if count <= warning_count:
        return 100.0

    # Linear interpolation
    score = 100.0 * (1 - (count - warning_count) / (min_count - warning_count))
    return max(0.0, min(100.0, score))


# === Anomaly Detection ===


def detect_anomaly(
    pool_snapshots: list[dict[str, Any]],
    contamination: float = 0.05,
) -> dict[str, bool]:
    """
    Detect anomalous pools using Isolation Forest.

    Rationale: Statistical outliers may indicate data quality issues,
    manipulated metrics, or genuinely risky protocols.

    Args:
        pool_snapshots: List of pool snapshot dictionaries
        contamination: Expected proportion of outliers (default 5%)

    Returns:
        Dictionary mapping pool_id to is_anomaly boolean
    """
    if len(pool_snapshots) < 10:
        # Not enough data for anomaly detection
        return {snap["pool_id"]: False for snap in pool_snapshots}

    # Extract features for anomaly detection
    features = []
    pool_ids = []

    for snap in pool_snapshots:
        tvl = decimal_to_float(snap.get("tvl_usd")) or 0
        apy = decimal_to_float(snap.get("apy")) or 0
        apy_sigma = decimal_to_float(snap.get("apy_sigma")) or 0
        tvl_change = decimal_to_float(snap.get("tvl_change_7d_pct")) or 0

        features.append([tvl, apy, apy_sigma, tvl_change])
        pool_ids.append(snap["pool_id"])

    # Replace zeros with small epsilon to avoid division issues
    features_array = np.array(features, dtype=float)
    features_array = np.where(features_array == 0, 1e-6, features_array)

    # Fit Isolation Forest
    iso_forest = IsolationForest(contamination=contamination, random_state=42)
    predictions = iso_forest.fit_predict(features_array)

    # -1 = anomaly, 1 = normal
    return {pool_id: (pred == -1) for pool_id, pred in zip(pool_ids, predictions)}


# === Aggregate Risk Score ===


def calculate_risk_score(snapshot: dict[str, Any]) -> dict[str, Any]:
    """
    Calculate aggregate risk score from pool snapshot.

    Weights are chosen to balance different risk dimensions.
    No single factor dominates; all contribute meaningfully.

    Weights (sum to 1.0):
    - TVL size: 0.15
    - TVL volatility: 0.15
    - APY volatility: 0.20
    - Reward ratio: 0.15
    - Stablecoin: 0.10
    - IL risk: 0.15
    - Data age: 0.10

    Args:
        snapshot: Pool snapshot dictionary

    Returns:
        Dictionary with risk score components and total
    """
    # Extract and convert values
    tvl_usd = decimal_to_float(snapshot.get("tvl_usd"))
    tvl_change_7d_pct = decimal_to_float(snapshot.get("tvl_change_7d_pct"))
    apy = decimal_to_float(snapshot.get("apy"))
    apy_sigma = decimal_to_float(snapshot.get("apy_sigma"))
    apy_pct_7d = decimal_to_float(snapshot.get("apy_pct_7d"))
    apy_reward = decimal_to_float(snapshot.get("apy_reward"))
    is_stablecoin = snapshot.get("is_stablecoin", False)
    il_risk = decimal_to_float(snapshot.get("il_risk"))
    count = snapshot.get("count")

    # Calculate individual signals
    tvl_score = tvl_size_signal(tvl_usd)
    tvl_vol_score = tvl_drop_signal(tvl_change_7d_pct)
    apy_vol_score = apy_volatility_signal(apy, apy_sigma, apy_pct_7d)
    reward_score = reward_ratio_signal(apy, apy_reward)
    stable_score = stablecoin_signal(is_stablecoin)
    il_score = il_risk_signal(il_risk)
    age_score = data_age_signal(count)

    # Weighted sum
    weights = {
        "tvl": 0.15,
        "tvl_volatility": 0.15,
        "apy_volatility": 0.20,
        "reward_ratio": 0.15,
        "stablecoin": 0.10,
        "il": 0.15,
        "data_age": 0.10,
    }

    total_risk_score = (
        weights["tvl"] * tvl_score
        + weights["tvl_volatility"] * tvl_vol_score
        + weights["apy_volatility"] * apy_vol_score
        + weights["reward_ratio"] * reward_score
        + weights["stablecoin"] * stable_score
        + weights["il"] * il_score
        + weights["data_age"] * age_score
    )

    # Determine risk category
    thresholds = settings.thresholds
    if total_risk_score <= thresholds.risk_low_max:
        category: RiskCategory = "low"
    elif total_risk_score <= thresholds.risk_medium_max:
        category = "medium"
    elif total_risk_score <= thresholds.risk_high_max:
        category = "high"
    else:
        category = "critical"

    return {
        "pool_id": snapshot["pool_id"],
        "snapshot_id": snapshot["id"],
        "tvl_score": tvl_score,
        "tvl_volatility_score": tvl_vol_score,
        "apy_volatility_score": apy_vol_score,
        "reward_ratio_score": reward_score,
        "stablecoin_score": stable_score,
        "il_score": il_score,
        "data_age_score": age_score,
        "total_risk_score": total_risk_score,
        "risk_category": category,
        "is_anomaly": False,  # Will be set by detect_anomaly
        "anomaly_reason": None,
        "model_version": settings.model_version,
        "calculated_at": datetime.now(timezone.utc),
    }


def compute_risk_scores_batch(
    pool_snapshots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Compute risk scores for a batch of pool snapshots.

    Args:
        pool_snapshots: List of pool snapshot dictionaries

    Returns:
        List of risk score dictionaries ready for database insertion
    """
    if not pool_snapshots:
        return []

    # Calculate individual scores
    risk_scores = [calculate_risk_score(snap) for snap in pool_snapshots]

    # Detect anomalies across the batch
    anomaly_flags = detect_anomaly(pool_snapshots)

    # Update anomaly flags
    for score in risk_scores:
        pool_id = score["pool_id"]
        is_anomaly = anomaly_flags.get(pool_id, False)
        score["is_anomaly"] = is_anomaly
        if is_anomaly:
            score["anomaly_reason"] = "Statistical outlier detected by Isolation Forest"

    return risk_scores
