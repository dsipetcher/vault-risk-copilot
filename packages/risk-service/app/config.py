"""Configuration for risk service with type-safe settings."""

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class RiskThresholds(BaseSettings):
    """Risk scoring thresholds - all configurable via environment."""

    # TVL thresholds (USD)
    tvl_low_threshold: float = Field(default=1_000_000.0, description="TVL below this = high risk")
    tvl_medium_threshold: float = Field(
        default=10_000_000.0, description="TVL above this = low risk"
    )
    tvl_drop_warning_pct: float = Field(default=20.0, description="TVL drop >X% in 7d = warning")
    tvl_drop_critical_pct: float = Field(default=50.0, description="TVL drop >X% in 7d = critical")

    # APY volatility thresholds
    apy_outlier_z_score: float = Field(default=2.5, description="Z-score for APY outlier detection")
    apy_spike_threshold_pct: float = Field(
        default=100.0, description="APY increase >X% in 7d = spike"
    )
    apy_high_absolute: float = Field(default=100.0, description="APY >X% absolute = suspicious")

    # Reward composition thresholds
    reward_ratio_low: float = Field(default=0.3, description="Reward/total APY <X = low dependency")
    reward_ratio_high: float = Field(
        default=0.7, description="Reward/total APY >X = high dependency"
    )

    # Data reliability thresholds
    data_min_count: int = Field(default=30, description="Minimum data points for reliable scoring")
    data_warning_count: int = Field(default=7, description="Data points <X = warning")

    # IL risk threshold
    il_risk_threshold: float = Field(default=0.5, description="IL risk >X = flag (0-1 scale)")

    # Vault share price drop threshold
    vault_price_drop_warning_pct: float = Field(
        default=1.0, description="Share price drop >X% = warning"
    )
    vault_price_drop_critical_pct: float = Field(
        default=5.0, description="Share price drop >X% = critical"
    )

    # Risk category boundaries (total_risk_score 0-100)
    risk_low_max: float = Field(default=25.0, description="Score ≤X = low risk")
    risk_medium_max: float = Field(default=50.0, description="Score ≤X = medium risk")
    risk_high_max: float = Field(default=75.0, description="Score ≤X = high risk")
    # Score >risk_high_max = critical


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: PostgresDsn | None = Field(
        default=None,
        description="PostgreSQL connection string",
    )

    # Service
    log_level: str = Field(default="info", description="Logging level")
    model_version: str = Field(default="1.0", description="Risk model version")

    # Risk thresholds
    thresholds: RiskThresholds = Field(default_factory=RiskThresholds)


# Global settings instance
settings = Settings()
