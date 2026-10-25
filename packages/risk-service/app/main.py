"""FastAPI application for risk scoring service."""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
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

_scheduler_task: asyncio.Task[None] | None = None


def _require_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Reject unauthenticated recompute when a token is configured."""
    expected = settings.risk_internal_token
    if not expected:
        return
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing internal token")


async def _run_recompute(pool_ids: list[str] | None = None) -> RecomputeResponse:
    start_time = time.time()
    computed = 0
    skipped = 0
    errors = 0
    computed_pool_ids: list[str] = []

    pool_snapshots = await db.fetch_latest_pool_snapshots(
        pool_ids=pool_ids,
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
    risk_scores = compute_risk_scores_batch(pool_snapshots)

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


async def _scheduler_loop() -> None:
    interval = max(settings.recompute_interval_seconds, 0)
    if settings.auto_recompute_on_startup and settings.database_url:
        try:
            logger.info("Startup risk recompute...")
            await _run_recompute()
        except Exception as e:
            logger.error(f"Startup recompute failed: {e}", exc_info=True)
    if interval <= 0:
        return
    while True:
        await asyncio.sleep(interval)
        try:
            logger.info("Scheduled risk recompute...")
            await _run_recompute()
        except Exception as e:
            logger.error(f"Scheduled recompute failed: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan: startup and shutdown."""
    global _scheduler_task
    logger.info("Starting risk service...")
    await db.connect()
    logger.info("Database connected")
    _scheduler_task = asyncio.create_task(_scheduler_loop())

    yield

    if _scheduler_task:
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        _scheduler_task = None
    logger.info("Shutting down risk service...")
    await db.disconnect()
    logger.info("Database disconnected")


app = FastAPI(
    title="Vault Risk Copilot - Risk Service",
    description="Calculate and serve explainable risk scores for DeFi pools",
    version="0.1.0",
    lifespan=lifespan,
)

_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Internal-Token"],
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
async def recompute_risk_scores(
    request: RecomputeRequest,
    _: None = Depends(_require_internal_token),
) -> RecomputeResponse:
    """Recompute risk scores for pools (internal token required when configured)."""
    try:
        return await _run_recompute(request.pool_ids)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during recompute: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") from e


@app.post("/risk/recompute/{pool_id}", response_model=RecomputeResponse)
async def recompute_risk_score_for_pool(
    pool_id: str,
    force: bool = False,  # accepted for API compatibility; scores are always recomputed
    _: None = Depends(_require_internal_token),
) -> RecomputeResponse:
    """Alias matching the API client path: POST /risk/recompute/{id}."""
    try:
        logger.info(f"Recompute requested for pool {pool_id} (force={force})")
        return await _run_recompute([pool_id])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during recompute for pool '{pool_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") from e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
