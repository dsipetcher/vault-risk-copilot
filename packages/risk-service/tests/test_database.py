"""Integration tests for database operations."""

import os
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import asyncpg
import pytest

from app.database import Database

# Skip integration tests if no DATABASE_URL
pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL not set, skipping integration tests",
)


@pytest.fixture
async def db_instance():
    """Create a database instance for testing."""
    db = Database()
    await db.connect()
    yield db
    await db.disconnect()


@pytest.fixture
async def sample_pool_snapshot(db_instance):
    """Insert a sample pool snapshot and return its ID."""
    if not db_instance.pool:
        pytest.skip("Database not connected")

    pool_id = f"test_pool_{uuid4().hex[:8]}"
    snapshot_id = uuid4()

    await db_instance.pool.execute(
        """
        INSERT INTO pool_snapshots (
            id, pool_id, protocol, chain, pool_name, pool_address,
            asset_symbol, is_stablecoin, tvl_usd, tvl_change_7d_pct,
            apy, apy_base, apy_reward, apy_sigma, il_risk, count,
            data_source, snapshot_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        """,
        snapshot_id,
        pool_id,
        "TestProtocol",
        "Ethereum",
        "Test Pool USDC",
        "0x1234567890123456789012345678901234567890",
        "USDC",
        True,
        Decimal("5000000.00"),
        Decimal("-5.50"),
        Decimal("10.50"),
        Decimal("8.00"),
        Decimal("2.50"),
        Decimal("1.20"),
        Decimal("0.10"),
        50,
        "test",
        datetime.now(UTC),
    )

    yield {"pool_id": pool_id, "snapshot_id": snapshot_id}

    # Cleanup
    await db_instance.pool.execute("DELETE FROM pool_snapshots WHERE pool_id = $1", pool_id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_database_connect(db_instance):
    """Test database connection."""
    assert db_instance.pool is not None
    assert isinstance(db_instance.pool, asyncpg.Pool)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fetch_latest_pool_snapshots(db_instance, sample_pool_snapshot):
    """Test fetching latest pool snapshots."""
    pool_id = sample_pool_snapshot["pool_id"]

    snapshots = await db_instance.fetch_latest_pool_snapshots(pool_ids=[pool_id], limit=10)

    assert len(snapshots) == 1
    assert snapshots[0]["pool_id"] == pool_id
    assert snapshots[0]["protocol"] == "TestProtocol"
    assert snapshots[0]["pool_name"] == "Test Pool USDC"
    assert snapshots[0]["is_stablecoin"] is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fetch_pool_snapshot_by_id(db_instance, sample_pool_snapshot):
    """Test fetching a specific pool snapshot."""
    pool_id = sample_pool_snapshot["pool_id"]

    snapshot = await db_instance.fetch_pool_snapshot_by_id(pool_id)

    assert snapshot is not None
    assert snapshot["pool_id"] == pool_id
    assert "tvl_usd" in snapshot
    assert "apy" in snapshot


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fetch_pool_snapshot_not_found(db_instance):
    """Test fetching non-existent pool."""
    snapshot = await db_instance.fetch_pool_snapshot_by_id("nonexistent_pool")
    assert snapshot is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_insert_risk_score(db_instance, sample_pool_snapshot):
    """Test inserting a risk score."""
    pool_id = sample_pool_snapshot["pool_id"]
    snapshot_id = sample_pool_snapshot["snapshot_id"]

    risk_score = {
        "pool_id": pool_id,
        "snapshot_id": snapshot_id,
        "tvl_score": 30.0,
        "tvl_volatility_score": 20.0,
        "apy_volatility_score": 15.0,
        "reward_ratio_score": 25.0,
        "stablecoin_score": 0.0,
        "il_score": 10.0,
        "data_age_score": 5.0,
        "total_risk_score": 35.5,
        "risk_category": "medium",
        "is_anomaly": False,
        "anomaly_reason": None,
        "model_version": "1.0",
        "calculated_at": datetime.now(UTC),
    }

    risk_id = await db_instance.insert_risk_score(risk_score)

    assert risk_id is not None

    # Verify insertion
    fetched = await db_instance.fetch_risk_score_by_pool(pool_id)
    assert fetched is not None
    assert float(fetched["total_risk_score"]) == 35.5
    assert fetched["risk_category"] == "medium"

    # Cleanup
    if db_instance.pool:
        await db_instance.pool.execute("DELETE FROM risk_scores WHERE pool_id = $1", pool_id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_insert_risk_score_upsert(db_instance, sample_pool_snapshot):
    """Test upserting a risk score (update on conflict)."""
    pool_id = sample_pool_snapshot["pool_id"]
    snapshot_id = sample_pool_snapshot["snapshot_id"]

    risk_score = {
        "pool_id": pool_id,
        "snapshot_id": snapshot_id,
        "tvl_score": 40.0,
        "tvl_volatility_score": 30.0,
        "apy_volatility_score": 20.0,
        "reward_ratio_score": 35.0,
        "stablecoin_score": 0.0,
        "il_score": 15.0,
        "data_age_score": 10.0,
        "total_risk_score": 45.0,
        "risk_category": "medium",
        "is_anomaly": False,
        "model_version": "1.0",
        "calculated_at": datetime.now(UTC),
    }

    # Insert first time
    await db_instance.insert_risk_score(risk_score)

    # Update with new score
    risk_score["total_risk_score"] = 55.0
    risk_score["risk_category"] = "high"
    await db_instance.insert_risk_score(risk_score)

    # Verify update
    fetched = await db_instance.fetch_risk_score_by_pool(pool_id)
    assert float(fetched["total_risk_score"]) == 55.0
    assert fetched["risk_category"] == "high"

    # Cleanup
    if db_instance.pool:
        await db_instance.pool.execute("DELETE FROM risk_scores WHERE pool_id = $1", pool_id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fetch_risk_scores_with_filters(db_instance, sample_pool_snapshot):
    """Test fetching risk scores with filters."""
    pool_id = sample_pool_snapshot["pool_id"]
    snapshot_id = sample_pool_snapshot["snapshot_id"]

    # Insert risk score
    risk_score = {
        "pool_id": pool_id,
        "snapshot_id": snapshot_id,
        "tvl_score": 50.0,
        "tvl_volatility_score": 40.0,
        "apy_volatility_score": 30.0,
        "reward_ratio_score": 45.0,
        "stablecoin_score": 0.0,
        "il_score": 20.0,
        "data_age_score": 15.0,
        "total_risk_score": 60.0,
        "risk_category": "high",
        "is_anomaly": True,
        "anomaly_reason": "Test outlier",
        "model_version": "1.0",
        "calculated_at": datetime.now(UTC),
    }

    await db_instance.insert_risk_score(risk_score)

    # Fetch with min_risk filter
    results = await db_instance.fetch_risk_scores(min_risk=50.0, limit=10)
    assert len(results) >= 1
    assert any(r["pool_id"] == pool_id for r in results)

    # Fetch with max_risk filter (should not include our score)
    results = await db_instance.fetch_risk_scores(max_risk=50.0, limit=10)
    assert not any(r["pool_id"] == pool_id for r in results)

    # Fetch by pool_ids
    results = await db_instance.fetch_risk_scores(pool_ids=[pool_id], limit=10)
    assert len(results) == 1
    assert results[0]["pool_id"] == pool_id

    # Cleanup
    if db_instance.pool:
        await db_instance.pool.execute("DELETE FROM risk_scores WHERE pool_id = $1", pool_id)
