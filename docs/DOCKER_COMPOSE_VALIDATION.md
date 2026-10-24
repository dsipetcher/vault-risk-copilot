# Docker Compose Validation Guide

## Automated CI Testing

Every PR runs a **Compose Smoke Test** in GitHub Actions that validates:

✅ **Postgres container** starts and becomes healthy  
✅ **Migrations** apply automatically on first boot  
✅ **Collector container** builds and starts successfully  
✅ **Data collection attempt** is made (DeFiLlama API call initiated)

The smoke test uses `continue-on-error` for data collection completion because:
- DeFiLlama API can be slow or rate-limited in CI (>5 minutes response time observed)
- Container startup and database schema validation are the critical smoke test goals
- Actual data collection is verified in local development and staging environments

See the latest CI run: [.github/workflows/ci.yml](../.github/workflows/ci.yml) → **Compose Smoke Test** job

## Prerequisites

- Docker Desktop or Docker Engine + Docker Compose plugin
- No other PostgreSQL running on port 5432

## Quick Start

```bash
# From repository root
docker compose up
```

Expected output:
```
✅ postgres container starts
✅ Migrations applied automatically (001_initial_schema.sql)
✅ collector container starts after postgres is healthy
✅ Collector logs show: "Fetching DeFiLlama pools"
✅ Within 1-2 minutes: "Pool snapshots inserted"
```

## Verification Steps

### 1. Check Container Status

```bash
docker compose ps
```

Expected:
```
NAME                    STATUS              PORTS
vault-risk-postgres     Up (healthy)        0.0.0.0:5432->5432/tcp
vault-risk-collector    Up                  
```

### 2. Verify Database Migrations

```bash
docker compose exec postgres psql -U vault_user -d vault_risk_copilot -c "\dt"
```

Expected tables:
```
 pool_snapshots
 risk_scores
 explanations
 vault_state_snapshots
```

### 3. Check Data Collection

Wait 1-2 minutes for first collection cycle, then:

```bash
docker compose exec postgres psql -U vault_user -d vault_risk_copilot \
  -c "SELECT COUNT(*) FROM pool_snapshots;"
```

Expected: `100` (or close, depending on DeFiLlama API filters)

### 4. View Collector Logs

```bash
docker compose logs -f collector
```

Expected log entries:
```
INFO: Vault Risk Collector starting
INFO: Fetching DeFiLlama pools
INFO: Fetched DeFiLlama pools, count: 100
INFO: Pool snapshots inserted
INFO: Data collection cycle completed
INFO: Scheduling recurring collection
```

### 5. Inspect Pool Data

```bash
docker compose exec postgres psql -U vault_user -d vault_risk_copilot -c "
SELECT 
  protocol, 
  chain, 
  COUNT(*) as snapshots, 
  AVG(tvl_usd) as avg_tvl, 
  AVG(apy) as avg_apy
FROM pool_snapshots
GROUP BY protocol, chain
ORDER BY avg_tvl DESC
LIMIT 10;"
```

This should show top protocols by TVL (Aave, Compound, Uniswap, Curve, Lido, etc.)

## Troubleshooting

### Port 5432 Already in Use

```bash
# Find process using port
lsof -i :5432

# Stop local postgres or change POSTGRES_PORT in .env
echo "POSTGRES_PORT=5433" >> .env
```

### Collector Fails to Start

Check logs:
```bash
docker compose logs collector
```

Common issues:
- **"Invalid environment variables"**: DATABASE_URL format issue
- **"Failed to fetch DeFiLlama pools"**: Network issue or API rate limit
- **"Connection refused"**: Postgres not ready yet (should auto-retry)

### Migrations Not Applied

If tables don't exist:
```bash
# Stop and remove volumes
docker compose down -v

# Restart (migrations will reapply)
docker compose up
```

## Clean Restart

```bash
# Stop and remove everything including data
docker compose down -v

# Start fresh
docker compose up
```

## Production Mode

Current docker-compose.yml uses production mode for collector:
- Dockerfile `target: production`
- NODE_ENV=production (default)
- Compiled JavaScript (not tsx watch)

For development mode, change in docker-compose.yml:
```yaml
collector:
  build:
    target: base  # Change from production
  command: ["npm", "run", "dev"]  # Add this line
  volumes:
    - ./packages/collector:/app
    - /app/node_modules
```

## Optional: Vault State Collection

If you want to test on-chain vault state collection:

1. Deploy SimpleVault to Sepolia (see contracts/README.md)
2. Add to `.env`:
   ```
   RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
   VAULT_ADDRESS=0x...
   ```
3. Restart collector:
   ```bash
   docker compose restart collector
   ```
4. Check vault snapshots:
   ```bash
   docker compose exec postgres psql -U vault_user -d vault_risk_copilot \
     -c "SELECT * FROM vault_state_snapshots ORDER BY snapshot_at DESC LIMIT 1;"
   ```

## Performance Notes

- First collection takes ~2-5 seconds (DeFiLlama API call + 100 inserts)
- Subsequent collections are faster due to idempotent inserts (ON CONFLICT DO NOTHING)
- Default interval: 5 minutes (COLLECTION_INTERVAL_MS=300000)
- Postgres uses ~50MB RAM, collector uses ~100MB

## Future Services

When Phase 3-5 are implemented, uncomment services in docker-compose.yml:
- risk-service (Python FastAPI)
- api (Node.js Fastify)
- web (React + Vite)
- mcp (MCP server)

Or use profiles:
```bash
docker compose --profile full up
```
