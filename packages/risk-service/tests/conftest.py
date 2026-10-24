"""Pytest configuration and fixtures."""



def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests without external dependencies")
    config.addinivalue_line(
        "markers", "integration: Integration tests requiring database connection"
    )
