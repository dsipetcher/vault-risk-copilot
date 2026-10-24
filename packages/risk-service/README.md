# Risk Service

**Python FastAPI service for calculating explainable risk scores for DeFi pools.**

## Overview

This service:
- Reads pool snapshots from PostgreSQL
- Computes transparent, rule-based risk signals per pool/vault
- Writes detailed risk scores with per-factor breakdown
- Exposes typed REST endpoints for score queries and recomputation

**No ML hype:** Deterministic, documented formulas with configurable thresholds.

## Risk Signals

See [../../docs/RISK_MODEL.md](../../docs/RISK_MODEL.md) for detailed explanations.

### Core Signals

1. **TVL Size Score** - Larger TVL = lower risk (more liquidity, harder to manipulate)
2. **TVL Drop Score** - Sharp TVL drops indicate capital flight
3. **APY Outlier Score** - Extremely high APY vs historical mean suggests unsustainability
4. **APY Spike Score** - Recent APY spikes may indicate temporary incentives
5. **Reward APY Share** - High reward/total APY ratio = dependent on external incentives
6. **Stablecoin Exposure** - Stablecoin pools = lower price volatility risk
7. **IL Risk Flag** - AMM pools with volatile assets = impermanent loss risk
8. **Data Staleness** - Pools with short data history = less reliable
9. **Vault Share Price Drop** - Our SimpleVault share price drops indicate losses

## Architecture

```
┌─────────────────┐
│   FastAPI       │
│   /health       │
│   /scores       │  ──┐
│   /scores/{id}  │    │
│   POST /recompute│   │
└─────────────────┘    │
                       │
┌──────────────────────┼──────────────────────┐
│  Risk Engine         │                      │
│                      ▼                      │
│  ┌────────────────────────────────┐        │
│  │ Signal Calculators             │        │
│  │ - tvl_signal()                 │        │
│  │ - apy_volatility_signal()      │        │
│  │ - reward_ratio_signal()        │        │
│  │ - ... 6 more                   │        │
│  └────────────────────────────────┘        │
│                  │                          │
│                  ▼                          │
│  ┌────────────────────────────────┐        │
│  │ Aggregate Scorer               │        │
│  │ - Weighted sum                 │        │
│  │ - Category assignment          │        │
│  │ - Anomaly detection            │        │
│  └────────────────────────────────┘        │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │   PostgreSQL       │
         │   pool_snapshots   │
         │   risk_scores      │
         └────────────────────┘
```

## Installation

### With uv (recommended)

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements-dev.txt
```

### With pip

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
```

## Development

### Run locally

```bash
# Set DATABASE_URL in .env
export DATABASE_URL="postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot"

# Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Lint and type check

```bash
ruff check .
ruff format .
mypy app/
```

### Run tests

```bash
# All tests
pytest

# Unit tests only (no database)
pytest -m unit

# With coverage
pytest --cov=app --cov-report=html
```

## Docker

```bash
docker build -t vault-risk-service .
docker run -p 8000:8000 --env-file .env vault-risk-service
```

## API Examples

### Health check

```bash
curl http://localhost:8000/health
```

### List all risk scores

```bash
curl http://localhost:8000/scores?limit=10&min_risk=50
```

### Get score for specific pool

```bash
curl http://localhost:8000/scores/aave-v3-usdc-eth
```

### Recompute scores

```bash
curl -X POST http://localhost:8000/recompute \
  -H "Content-Type: application/json" \
  -d '{"pool_ids": ["aave-v3-usdc-eth"], "force": false}'
```

## Configuration

Risk thresholds are defined in `app/config.py`. Key parameters:

- `TVL_LOW_THRESHOLD`: TVL below this (USD) = high risk
- `APY_OUTLIER_Z_SCORE`: Z-score for APY outlier detection
- `REWARD_RATIO_HIGH`: Reward APY > this fraction = high dependency
- `DATA_MIN_COUNT`: Minimum data points for reliable scoring
- Risk category thresholds: `0-25=low, 26-50=medium, 51-75=high, 76-100=critical`

## Limitations

This is a **learning project** with a simplified risk model. It does NOT:

- Predict future yields or prices (no backtested ML models)
- Account for smart contract risk or audit quality
- Consider oracle manipulation or governance risks
- Incorporate market-wide correlation or contagion
- Provide financial advice

**Use for educational purposes only. Testnet only.**

## License

MIT - See [../../LICENSE](../../LICENSE)
