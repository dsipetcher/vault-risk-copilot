# Collector Service

TypeScript-based data collector for Vault Risk Copilot. Collects:

1. **DeFi pool data** from DeFiLlama Yields API
2. **On-chain vault state** from Sepolia using viem

## Features

- ✅ Scheduled collection via cron
- ✅ Postgres storage with idempotent inserts
- ✅ Zod validation for configuration and data
- ✅ Structured logging with pino
- ✅ Graceful shutdown on SIGINT/SIGTERM

## Configuration

See `.env.example` in project root. Required:

- `DATABASE_URL` - PostgreSQL connection string
- `DEFILLAMA_API_URL` - DeFiLlama API (default: https://yields.llama.fi)
- `COLLECTION_INTERVAL_MS` - Collection interval in milliseconds (default: 300000 = 5 min)

Optional (for vault state collection):

- `RPC_URL` - Sepolia RPC endpoint
- `VAULT_ADDRESS` - SimpleVault contract address

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
npm run test:watch
```

## Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t vault-risk-collector .
docker run --env-file .env vault-risk-collector
```

## Data Sources

### DeFiLlama Yields API

**Endpoint:** `GET https://yields.llama.fi/pools`

**Filters applied:**
- TVL ≥ $100,000
- APY between 0% and 1000%
- Chains: Ethereum, Arbitrum, Optimism, Polygon, Base
- Protocols: Aave, Compound, Uniswap, Curve, Lido, MakerDAO
- Top 100 pools after filtering

**Rate limits:** Check https://defillama.com/docs/api

### On-chain Vault State

**Contract:** SimpleVault (ERC-4626) on Sepolia  
**Methods called:**
- `totalAssets()` - Total assets in vault
- `totalSupply()` - Total shares issued
- `depositCap()` - Maximum allowed deposits
- `paused()` - Pause state
- `owner()` - Owner address

**Frequency:** Same as DeFiLlama collection interval

## Database Schema

Inserts into:
- `pool_snapshots` - DeFi pool metrics
- `vault_state_snapshots` - On-chain vault state

See `db/migrations/001_initial_schema.sql` for schema.

## Error Handling

- Network errors: Logged and retried on next cycle
- Validation errors: Logged and skipped
- Database errors: Fatal, process exits

## License

MIT
