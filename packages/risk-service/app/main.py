"""FastAPI application for risk scoring service."""

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import db
from app.models import (
    HealthResponse,
    RecomputeRequest,
    RecomputeResponse,
    RiskScoreBreakdown,
    RiskScoreResponse,
    RiskScoresListResponse,
)
from app.risk_engine import compute_risk_scores_batch

# Configure logging
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan: startup and shutdown."""
    # Startup
    logger.info("Starting risk service...")
    await db.connect()
    logger.info("Database connected")

    yield

    # Shutdown
    logger.info("Shutting down risk service...")
    await db.disconnect()
    logger.info("Database disconnected")


app = FastAPI(
    title="Vault Risk Copilot - Risk Service",
    description="Calculate and serve explainable risk scores for DeFi pools",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns service status, version, and database connectivity.
    """
    db_status = "connected" if db.pool else "disconnected"
    status = "healthy" if db_status == "connected" else "unhealthy"

    return HealthResponse(
        status=status,
        version="0.1.0",
        model_version=settings.model_version,
        database=db_status,
        timestamp=datetime.now(UTC),
    )


@app.get("/scores", response_model=RiskScoresListResponse)
async def list_risk_scores(
    pool_ids: list[str] | None = Query(None, description="Filter by pool IDs"),
    min_risk: float | None = Query(None, ge=0, le=100, description="Minimum risk score"),
    max_risk: float | None = Query(None, ge=0, le=100, description="Maximum risk score"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
) -> RiskScoresListResponse:
    """
    List risk scores with optional filters.

    Args:
        pool_ids: Optional list of specific pool IDs
        min_risk: Minimum risk score threshold (0-100)
        max_risk: Maximum risk score threshold (0-100)
        limit: Maximum number of results

    Returns:
        List of risk scores with breakdown
    """
    try:
        # Fetch risk scores from database
        risk_scores = await db.fetch_risk_scores(
            pool_ids=pool_ids,
            min_risk=min_risk,
            max_risk=max_risk,
            limit=limit,
        )

        # Also fetch pool metadata for names
        pool_id_list = [score["pool_id"] for score in risk_scores]
        pool_snapshots = await db.fetch_latest_pool_snapshots(
            pool_ids=pool_id_list, limit=len(pool_id_list)
        )
        pool_meta = {snap["pool_id"]: snap for snap in pool_snapshots}

        # Build response
        responses = []
        for score in risk_scores:
            pool_id = score["pool_id"]
            pool = pool_meta.get(pool_id, {})

            responses.append(
                RiskScoreResponse(
                    pool_id=pool_id,
                    pool_name=pool.get("pool_name", "Unknown"),
                    protocol=pool.get("protocol", "Unknown"),
                    chain=pool.get("chain", "Unknown"),
                    total_risk_score=float(score["total_risk_score"]),
                    risk_category=score["risk_category"],
                    breakdown=RiskScoreBreakdown(
                        tvl_score=float(score["tvl_score"]),
                        tvl_volatility_score=float(score["tvl_volatility_score"]),
                        apy_volatility_score=float(score["apy_volatility_score"]),
                        reward_ratio_score=float(score["reward_ratio_score"]),
                        stablecoin_score=float(score["stablecoin_score"]),
                        il_score=float(score["il_score"]),
                        data_age_score=float(score["data_age_score"]),
                        vault_score=float(score["vault_score"]),
                    ),
                    is_anomaly=score["is_anomaly"],
                    anomaly_reason=score["anomaly_reason"],
                    calculated_at=score["calculated_at"],
                    model_version=score["model_version"],
                )
            )

        return RiskScoresListResponse(
            scores=responses,
            total=len(responses),
            limit=limit,
        )

    except Exception as e:
        logger.error(f"Error listing risk scores: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") from e


@app.get("/scores/{pool_id}", response_model=RiskScoreResponse)
async def get_risk_score(pool_id: str) -> RiskScoreResponse:
    """
    Get risk score for a specific pool.

    Args:
        pool_id: Pool identifier

    Returns:
        Risk score with detailed breakdown

    Raises:
        404: Pool not found or no risk score available
    """
    try:
        # Fetch risk score
        risk_score = await db.fetch_risk_score_by_pool(pool_id)
        if not risk_score:
            raise HTTPException(
                status_code=404,
                detail=f"No risk score found for pool '{pool_id}'",
            )

        # Fetch pool metadata
        pool_snapshot = await db.fetch_pool_snapshot_by_id(pool_id)
        if not pool_snapshot:
            raise HTTPException(
                status_code=404,
                detail=f"Pool '{pool_id}' not found in snapshots",
            )

        return RiskScoreResponse(
            pool_id=pool_id,
            pool_name=pool_snapshot["pool_name"],
            protocol=pool_snapshot["protocol"],
            chain=pool_snapshot["chain"],
            total_risk_score=float(risk_score["total_risk_score"]),
            risk_category=risk_score["risk_category"],
            breakdown=RiskScoreBreakdown(
                tvl_score=float(risk_score["tvl_score"]),
                tvl_volatility_score=float(risk_score["tvl_volatility_score"]),
                apy_volatility_score=float(risk_score["apy_volatility_score"]),
                reward_ratio_score=float(risk_score["reward_ratio_score"]),
                stablecoin_score=float(risk_score["stablecoin_score"]),
                il_score=float(risk_score["il_score"]),
                data_age_score=float(risk_score["data_age_score"]),
                vault_score=float(risk_score["vault_score"]),
            ),
            is_anomaly=risk_score["is_anomaly"],
            anomaly_reason=risk_score["anomaly_reason"],
            calculated_at=risk_score["calculated_at"],
            model_version=risk_score["model_version"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching risk score for pool '{pool_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") from e


@app.post("/recompute", response_model=RecomputeResponse)
async def recompute_risk_scores(request: RecomputeRequest) -> RecomputeResponse:
    """
    Recompute risk scores for pools.

    Args:
        request: Recompute configuration (pool IDs, force flag)

    Returns:
        Summary of computation results
    """
    start_time = time.time()
    computed = 0
    skipped = 0
    errors = 0
    computed_pool_ids: list[str] = []

    try:
        # Fetch pool snapshots
        pool_snapshots = await db.fetch_latest_pool_snapshots(
            pool_ids=request.pool_ids,
            limit=1000,
        )

        if not pool_snapshots:
            return RecomputeResponse(
                computed=0,
                skipped=0,
                errors=0,
                pool_ids=[],
                elapsed_seconds=time.time() - start_time,
            )

        logger.info(f"Recomputing risk scores for {len(pool_snapshots)} pools...")

        # Compute risk scores in batch
        risk_scores = compute_risk_scores_batch(pool_snapshots)

        # Insert into database
        for risk_score in risk_scores:
            try:
                await db.insert_risk_score(risk_score)
                computed += 1
                computed_pool_ids.append(risk_score["pool_id"])
            except Exception as e:
                logger.error(f"Error inserting risk score for pool {risk_score['pool_id']}: {e}")
                errors += 1

        elapsed = time.time() - start_time
        logger.info(
            f"Recompute complete: {computed} computed, {skipped} skipped, "
            f"{errors} errors in {elapsed:.2f}s"
        )

        return RecomputeResponse(
            computed=computed,
            skipped=skipped,
            errors=errors,
            pool_ids=computed_pool_ids,
            elapsed_seconds=elapsed,
        )

    except Exception as e:
        logger.error(f"Error during recompute: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") from e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
