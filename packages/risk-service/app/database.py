"""Database connection and queries for risk service."""

from typing import Any

import asyncpg

from app.config import settings


class Database:
    """Async PostgreSQL database connection manager."""

    def __init__(self) -> None:
        self.pool: asyncpg.Pool[asyncpg.Record] | None = None

    async def connect(self) -> None:
        """Create connection pool."""
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                str(settings.database_url),
                min_size=2,
                max_size=10,
                command_timeout=60,
            )

    async def disconnect(self) -> None:
        """Close connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def fetch_latest_pool_snapshots(
        self, pool_ids: list[str] | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        """
        Fetch the most recent snapshot for each pool.

        Args:
            pool_ids: Optional list of specific pool IDs to fetch
            limit: Maximum number of pools to return

        Returns:
            List of pool snapshot dictionaries with latest data
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        # Get latest snapshot per pool using DISTINCT ON
        query = """
            SELECT DISTINCT ON (pool_id)
                id,
                pool_id,
                protocol,
                chain,
                pool_name,
                pool_address,
                asset_symbol,
                asset_address,
                is_stablecoin,
                tvl_usd,
                tvl_usd_7d_ago,
                tvl_change_7d_pct,
                apy,
                apy_base,
                apy_reward,
                apy_7d,
                apy_pct_7d,
                apy_sigma,
                il_risk,
                count,
                data_source,
                snapshot_at,
                created_at
            FROM pool_snapshots
        """

        params: list[Any] = []
        if pool_ids:
            query += " WHERE pool_id = ANY($1::text[])"
            params.append(pool_ids)

        query += " ORDER BY pool_id, snapshot_at DESC"

        if limit:
            param_idx = len(params) + 1
            query += f" LIMIT ${param_idx}"
            params.append(limit)

        rows = await self.pool.fetch(query, *params)
        return [dict(row) for row in rows]

    async def fetch_pool_snapshot_by_id(self, pool_id: str) -> dict[str, Any] | None:
        """
        Fetch the latest snapshot for a specific pool.

        Args:
            pool_id: Pool identifier

        Returns:
            Pool snapshot dictionary or None if not found
        """
        results = await self.fetch_latest_pool_snapshots(pool_ids=[pool_id], limit=1)
        return results[0] if results else None

    async def insert_risk_score(self, risk_score: dict[str, Any]) -> str:
        """
        Insert a new risk score record.

        Args:
            risk_score: Risk score data dictionary

        Returns:
            UUID of the inserted record
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        query = """
            INSERT INTO risk_scores (
                pool_id,
                snapshot_id,
                tvl_score,
                tvl_volatility_score,
                apy_volatility_score,
                reward_ratio_score,
                stablecoin_score,
                il_score,
                data_age_score,
                vault_score,
                total_risk_score,
                risk_category,
                is_anomaly,
                anomaly_reason,
                model_version,
                calculated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
            ON CONFLICT (pool_id, snapshot_id) DO UPDATE SET
                tvl_score = EXCLUDED.tvl_score,
                tvl_volatility_score = EXCLUDED.tvl_volatility_score,
                apy_volatility_score = EXCLUDED.apy_volatility_score,
                reward_ratio_score = EXCLUDED.reward_ratio_score,
                stablecoin_score = EXCLUDED.stablecoin_score,
                il_score = EXCLUDED.il_score,
                data_age_score = EXCLUDED.data_age_score,
                vault_score = EXCLUDED.vault_score,
                total_risk_score = EXCLUDED.total_risk_score,
                risk_category = EXCLUDED.risk_category,
                is_anomaly = EXCLUDED.is_anomaly,
                anomaly_reason = EXCLUDED.anomaly_reason,
                model_version = EXCLUDED.model_version,
                calculated_at = EXCLUDED.calculated_at
            RETURNING id
        """

        row_id = await self.pool.fetchval(
            query,
            risk_score["pool_id"],
            risk_score["snapshot_id"],
            risk_score["tvl_score"],
            risk_score["tvl_volatility_score"],
            risk_score["apy_volatility_score"],
            risk_score["reward_ratio_score"],
            risk_score["stablecoin_score"],
            risk_score["il_score"],
            risk_score["data_age_score"],
            risk_score["vault_score"],
            risk_score["total_risk_score"],
            risk_score["risk_category"],
            risk_score["is_anomaly"],
            risk_score.get("anomaly_reason"),
            risk_score["model_version"],
            risk_score["calculated_at"],
        )
        return str(row_id)

    async def fetch_risk_scores(
        self,
        pool_ids: list[str] | None = None,
        min_risk: float | None = None,
        max_risk: float | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Fetch risk scores with optional filters.

        Args:
            pool_ids: Optional list of pool IDs
            min_risk: Minimum risk score threshold
            max_risk: Maximum risk score threshold
            limit: Maximum number of results

        Returns:
            List of risk score dictionaries
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        query = """
            SELECT
                id,
                pool_id,
                snapshot_id,
                tvl_score,
                tvl_volatility_score,
                apy_volatility_score,
                reward_ratio_score,
                stablecoin_score,
                il_score,
                data_age_score,
                vault_score,
                total_risk_score,
                risk_category,
                is_anomaly,
                anomaly_reason,
                model_version,
                calculated_at
            FROM risk_scores
            WHERE 1=1
        """

        params: list[Any] = []
        param_idx = 1

        if pool_ids:
            query += f" AND pool_id = ANY(${param_idx}::text[])"
            params.append(pool_ids)
            param_idx += 1

        if min_risk is not None:
            query += f" AND total_risk_score >= ${param_idx}"
            params.append(min_risk)
            param_idx += 1

        if max_risk is not None:
            query += f" AND total_risk_score <= ${param_idx}"
            params.append(max_risk)
            param_idx += 1

        query += " ORDER BY calculated_at DESC"

        if limit:
            query += f" LIMIT ${param_idx}"
            params.append(limit)

        rows = await self.pool.fetch(query, *params)
        return [dict(row) for row in rows]

    async def fetch_risk_score_by_pool(self, pool_id: str) -> dict[str, Any] | None:
        """
        Fetch the latest risk score for a specific pool.

        Args:
            pool_id: Pool identifier

        Returns:
            Risk score dictionary or None if not found
        """
        results = await self.fetch_risk_scores(pool_ids=[pool_id], limit=1)
        return results[0] if results else None


# Global database instance
db = Database()
