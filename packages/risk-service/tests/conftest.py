"""Pytest configuration and fixtures."""

import os
import pytest


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests without external dependencies")
    config.addinivalue_line(
        "markers", "integration: Integration tests requiring database connection"
    )


@pytest.fixture(scope="session", autouse=True)
def check_database_url():
    """
    Warn if DATABASE_URL is not set for integration tests.

    Integration tests will be skipped if DATABASE_URL is missing.
    """
    if not os.getenv("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set, skipping integration tests", allow_module_level=True)
