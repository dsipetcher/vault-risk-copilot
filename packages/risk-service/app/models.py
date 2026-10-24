"""Pydantic models for risk service API and internal data."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# === Pool Snapshot Models ===


class PoolSnapshot(BaseModel):
    """Pool snapshot data from database."""

    id: UUID
    pool_id: str
    protocol: str
    chain: str
    pool_name: str
    pool_address: str | None
    asset_symbol: str | None
    asset_address: str | None
    is_stablecoin: bool
    tvl_usd: Decimal | None
    tvl_usd_7d_ago: Decimal | None
    tvl_change_7d_pct: Decimal | None
    apy: Decimal | None
    apy_base: Decimal | None
    apy_reward: Decimal | None
    apy_7d: Decimal | None
    apy_pct_7d: Decimal | None
    apy_sigma: Decimal | None
    il_risk: Decimal | None
    count: int | None
    data_source: str
    snapshot_at: datetime
    created_at: datetime


# === Risk Score Models ===


RiskCategory = Literal["low", "medium", "high", "critical"]


class RiskScoreBreakdown(BaseModel):
    """Detailed breakdown of risk score components."""

    tvl_score: float = Field(description="TVL size risk (0-100)")
    tvl_volatility_score: float = Field(description="TVL drop risk (0-100)")
    apy_volatility_score: float = Field(description="APY volatility risk (0-100)")
    reward_ratio_score: float = Field(description="Reward dependency risk (0-100)")
    stablecoin_score: float = Field(description="Asset type risk (0-100)")
    il_score: float = Field(description="Impermanent loss risk (0-100)")
    data_age_score: float = Field(description="Data reliability risk (0-100)")


class RiskScore(BaseModel):
    """Risk score record from database."""

    id: UUID
    pool_id: str
    snapshot_id: UUID
    tvl_score: Decimal
    tvl_volatility_score: Decimal
    apy_volatility_score: Decimal
    reward_ratio_score: Decimal
    stablecoin_score: Decimal
    il_score: Decimal
    data_age_score: Decimal
    total_risk_score: Decimal
    risk_category: RiskCategory
    is_anomaly: bool
    anomaly_reason: str | None
    model_version: str
    calculated_at: datetime


class RiskScoreResponse(BaseModel):
    """API response for a single risk score."""

    pool_id: str
    pool_name: str
    protocol: str
    chain: str
    total_risk_score: float = Field(description="Aggregate risk score (0-100)")
    risk_category: RiskCategory
    breakdown: RiskScoreBreakdown
    is_anomaly: bool
    anomaly_reason: str | None = None
    calculated_at: datetime
    model_version: str


class RiskScoresListResponse(BaseModel):
    """API response for list of risk scores."""

    scores: list[RiskScoreResponse]
    total: int
    limit: int


# === API Request/Response Models ===


class HealthResponse(BaseModel):
    """Health check response."""

    status: Literal["healthy", "unhealthy"]
    version: str
    model_version: str
    database: Literal["connected", "disconnected"]
    timestamp: datetime


class RecomputeRequest(BaseModel):
    """Request to recompute risk scores."""

    pool_ids: list[str] | None = Field(
        default=None,
        description="Specific pool IDs to recompute (null = all pools)",
    )
    force: bool = Field(
        default=False,
        description="Force recompute even if scores exist for latest snapshot",
    )


class RecomputeResponse(BaseModel):
    """Response from recompute operation."""

    computed: int = Field(description="Number of scores computed")
    skipped: int = Field(description="Number of pools skipped (no new data)")
    errors: int = Field(description="Number of errors encountered")
    pool_ids: list[str] = Field(description="Pool IDs that were computed")
    elapsed_seconds: float
