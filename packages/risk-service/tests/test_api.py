"""API endpoint tests using httpx test client."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Create async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Test health check endpoint."""
    response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()

    assert "status" in data
    assert data["status"] in ["healthy", "unhealthy"]
    assert "version" in data
    assert "model_version" in data
    assert "database" in data
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_list_scores_empty(client):
    """Test listing scores when none exist (or with limit)."""
    response = await client.get("/scores?limit=0")

    # Even with limit=0, should return valid response structure
    # (actual implementation will return empty or error)
    assert response.status_code in [200, 422]  # 422 if limit=0 rejected


@pytest.mark.asyncio
async def test_list_scores_with_filters(client):
    """Test listing scores with various filters."""
    response = await client.get("/scores?min_risk=50&max_risk=75&limit=10")

    assert response.status_code == 200
    data = response.json()

    assert "scores" in data
    assert "total" in data
    assert "limit" in data
    assert isinstance(data["scores"], list)


@pytest.mark.asyncio
async def test_list_scores_invalid_params(client):
    """Test listing scores with invalid parameters."""
    # min_risk > 100
    response = await client.get("/scores?min_risk=150")
    assert response.status_code == 422

    # Negative limit
    response = await client.get("/scores?limit=-5")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_score_not_found(client):
    """Test getting score for non-existent pool."""
    response = await client.get("/scores/nonexistent_pool_12345")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_recompute_empty(client):
    """Test recompute with no pools (should succeed with 0 computed)."""
    payload = {"pool_ids": [], "force": False}
    response = await client.post("/recompute", json=payload)

    # Should accept empty pool_ids (recomputes nothing)
    # Or returns valid response
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_recompute_invalid_payload(client):
    """Test recompute with invalid payload."""
    # Invalid type for pool_ids
    payload = {"pool_ids": "not_a_list", "force": False}
    response = await client.post("/recompute", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_recompute_valid_request(client):
    """Test recompute with valid request structure."""
    payload = {
        "pool_ids": ["test_pool_1", "test_pool_2"],
        "force": True,
    }
    response = await client.post("/recompute", json=payload)

    # Even if pools don't exist, request should be accepted
    # Response should have expected structure
    assert response.status_code == 200
    data = response.json()

    assert "computed" in data
    assert "skipped" in data
    assert "errors" in data
    assert "pool_ids" in data
    assert "elapsed_seconds" in data
    assert isinstance(data["computed"], int)
    assert isinstance(data["elapsed_seconds"], (int, float))
