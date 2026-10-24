# Vault Risk Copilot - API Service

Node.js + TypeScript API service that aggregates pool data, risk scores, and vault state.

## Features

- **Pools API**: List and filter DeFi pools with risk scores
- **Risk API**: Trigger risk score recomputation via risk-service
- **Vault API**: Read on-chain vault state (total assets, share price)
- **OpenAPI Documentation**: Auto-generated at `/docs`
- **Security**: Helmet, CORS, rate limiting
- **Validation**: Zod schemas for all inputs
- **Structured Logging**: Pino logger with pretty output in dev

## Endpoints

### Pools

- `GET /api/pools` - List pools with filters and pagination
  - Query params: `protocol`, `chain`, `is_stablecoin`, `risk_category`, `min_tvl`, `max_tvl`, `limit`, `offset`
- `GET /api/pools/:id` - Get single pool with detailed risk breakdown
- `GET /api/pools/:id/history` - Get historical snapshots

### Risk

- `POST /api/risk/recompute/:id` - Trigger risk recomputation (proxies to risk-service)

### Vault

- `GET /api/vault/state` - Get current on-chain vault state

### Health

- `GET /api/health` - Health check (checks database + risk-service)

## Development

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env

# Start dev server (with hot reload)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Start production
npm start
```

## Environment Variables

See `.env.example` for all available variables.

## Docker

```bash
# Build
docker build -t vault-risk-api .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e RISK_SERVICE_URL=http://risk-service:8000 \
  vault-risk-api
```

## API Documentation

Once running, visit:
- **API docs**: http://localhost:3000/docs
- **Health check**: http://localhost:3000/api/health

## Architecture

```
src/
├── index.ts           # App entry point, Fastify setup
├── config.ts          # Environment config with Zod validation
├── database.ts        # PostgreSQL pool
├── routes/            # API route handlers
│   ├── health.ts
│   ├── pools.ts
│   ├── risk.ts
│   └── vault.ts
├── services/          # Business logic
│   ├── pools.ts       # Query pool snapshots
│   ├── risk.ts        # Proxy to risk-service
│   └── vault.ts       # Read vault state via viem
└── types/
    └── schemas.ts     # Zod schemas and TypeScript types
```

## Testing

Tests use Vitest:

```bash
npm test                  # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
```
