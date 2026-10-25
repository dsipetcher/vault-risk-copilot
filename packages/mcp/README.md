# Vault Risk Copilot - MCP Server

Model Context Protocol (MCP) server for Vault Risk Copilot, enabling AI assistants like Claude Desktop and Cursor to query DeFi pool risk data and vault state.

## Features

- **Read-only tools** - No transaction signing, safe for AI assistants
- **Multiple transports** - stdio (primary) and HTTP (optional, localhost-bound)
- **Comprehensive risk data** - Pool lists, risk scores, comparisons, and LLM explanations
- **Structured output** - JSON + human-readable summaries
- **Resources** - Methodology documentation
- **Prompts** - Pre-built assessment templates
- **Security-first** - Input validation, timeouts, error handling, no secrets in logs

## Installation

```bash
cd packages/mcp
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required: API base URL
API_BASE_URL=http://localhost:3000

# Optional: BYOK LLM key for explain_pool_risk (requires X_LLM_PROVIDER)
X_LLM_API_KEY=your-api-key-here
X_LLM_PROVIDER=groq            # openai | openrouter | groq | ollama | mock
X_LLM_MODEL=openai/gpt-oss-120b  # optional

# HTTP transport (only with --transport http). Token is REQUIRED,
# host must be loopback (localhost / 127.0.0.1 / ::1).
HTTP_PORT=3001
HTTP_HOST=localhost
HTTP_AUTH_TOKEN=your-secret-token
```

## Running the Server

### stdio transport (for Claude Desktop, Cursor)

```bash
npm start
# or
node dist/index.js
```

### HTTP transport (for custom integrations)

```bash
npm run start:http
# or
node dist/index.js --transport http
```

Streamable HTTP (stateless) endpoint: `POST http://localhost:3001/mcp` with
`Authorization: Bearer $HTTP_AUTH_TOKEN`. Requests with a non-loopback `Host`
or `Origin` header are rejected (DNS-rebinding protection).

## Tools

### `list_pools`

List DeFi pools with optional filters and sorting.

**Input:**
```json
{
  "limit": 20,
  "offset": 0,
  "chain": "Ethereum",
  "protocol": "Aave",
  "min_tvl": 1000000,
  "sort": "tvl"
}
```

**Output:**
- Summary text: "Found X pools..."
- JSON array of pools with basic info + risk scores

**Filters:**
- `chain` - Blockchain name (e.g., "Ethereum", "Arbitrum")
- `protocol` - Protocol name (e.g., "Aave", "Uniswap")
- `min_tvl` - Minimum total value locked in USD
- `sort` - Sort by "tvl", "risk", or "apy" (descending)

**Pagination:**
- `limit` - Results per page (1-50, default: 20)
- `offset` - Skip N results (default: 0)

---

### `get_pool_risk`

Get detailed risk analysis for a specific pool.

**Input:**
```json
{
  "pool_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
- Summary text: Protocol, chain, TVL, APY, risk score
- JSON with full pool details, risk signals breakdown, and 7-day history

**Risk Signals:**
- `tvl_score` - Total value locked risk (0-20)
- `tvl_volatility_score` - TVL stability (0-15)
- `apy_volatility_score` - APY fluctuation (0-20)
- `reward_ratio_score` - Incentive sustainability (0-15)
- `stablecoin_score` - Asset type risk (0-10)
- `il_score` - Impermanent loss risk (0-10)
- `data_age_score` - Data freshness (0-5)
- `vault_score` - Vault-specific risks (0-5)
- `is_anomaly` - Statistical outlier flag

---

### `compare_pools`

Compare 2-5 pools side-by-side.

**Input:**
```json
{
  "pool_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440000"
  ]
}
```

**Output:**
- Summary text: Ranked list by risk score
- JSON comparison table sorted by risk (highest first)

---

### `explain_pool_risk`

Get a natural-language explanation of pool risk using LLM.

**Input:**
```json
{
  "pool_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
- Human-readable explanation with key factors
- Metadata: provider, model, tokens, latency, fallback flag

**Fallback Mode:**
If `X_LLM_API_KEY` is not configured, returns a structured fallback explanation with `metadata.fallback = true`.

---

### `get_vault_info`

Get ERC-4626 vault state (if available).

**Input:**
```json
{}
```

**Output:**
- Vault address, chain ID, total assets, total supply, share price, block number
- Returns "not available" message if vault is not deployed or API endpoint is not implemented

---

## Resources

### `methodology://risk-signals`

Markdown document explaining:
- Risk signal definitions (TVL, APY volatility, reward ratio, etc.)
- Risk categories (low/medium/high/critical)
- Model limitations
- Data sources

**Usage in Claude Desktop:**
```
Read methodology://risk-signals
```

---

## Prompts

### `assess_pool_risk`

Pre-built prompt template for pool risk assessment.

**Arguments:**
- `pool_id` (required)

**Workflow:**
1. Call `get_pool_risk` for detailed data
2. Call `explain_pool_risk` for LLM explanation
3. Analyze key risk factors
4. Provide summary with top 3 risks and anomalies

---

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "vault-risk-copilot": {
      "command": "node",
      "args": [
        "/absolute/path/to/vault-risk-copilot/packages/mcp/dist/index.js"
      ],
      "env": {
        "API_BASE_URL": "http://localhost:3000",
        "X_LLM_API_KEY": "your-api-key-here",
        "X_LLM_PROVIDER": "groq"
      }
    }
  }
}
```

**Restart Claude Desktop** after configuration.

---

## Cursor Configuration

Add to `.cursor/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "vault-risk-copilot": {
      "command": "node",
      "args": [
        "/absolute/path/to/vault-risk-copilot/packages/mcp/dist/index.js"
      ],
      "env": {
        "API_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Quickstart

### 1. Start the API server

```bash
cd /path/to/vault-risk-copilot
docker compose up -d
```

Wait for API to be healthy:
```bash
curl http://localhost:3000/api/health
```

### 2. Build MCP server

```bash
cd packages/mcp
npm install
npm run build
```

### 3. Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### 4. Query pools

In Claude Desktop or Cursor:

```
List the top 5 DeFi pools by TVL
```

```
Get risk analysis for pool <pool_id>
```

```
Compare pools <pool_id_1> and <pool_id_2>
```

---

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Tests
npm test                  # Unit tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npm run test:integration  # Integration tests (requires API running)
```

---

## Testing

### Unit Tests

Run without external dependencies:
```bash
npm test
```

Uses `msw` to mock API responses.

### Integration Tests

Requires a running API server:

```bash
# Start API (in another terminal)
cd ../..
docker compose up -d

# Run integration tests
npm run test:integration
```

Tests:
- Server startup via stdio
- Tool list and schemas
- Real API calls (list_pools, get_pool_risk)
- Error handling (unknown pool)
- Resources and prompts

---

## Security

### Read-only
- No transaction signing
- No wallet connection
- No smart contract writes

### Input Validation
- All inputs validated with Zod schemas
- UUIDs checked
- Limits enforced (max 50 pools, 5 comparisons)

### Timeouts
- Default 30s request timeout
- Prevents hanging on slow APIs

### Error Handling
- API errors mapped to MCP errors
- No stack traces or raw provider errors exposed
- Safe error messages

### Secrets Management
- LLM API key via environment variable (never logged)
- HTTP auth token required for HTTP transport (if enabled)
- Origin validation for HTTP transport (localhost only)

### Logging
- stderr only (stdio mode)
- No secrets in logs
- Configurable log level

---

## Troubleshooting

### "API_BASE_URL is required"
Set `API_BASE_URL` in your environment or MCP config.

### "Request timeout"
- Check if API is running: `curl http://localhost:3000/api/health`
- Increase `REQUEST_TIMEOUT_MS` if API is slow

### "Resource not found" (404)
- Pool ID may be invalid (use `list_pools` to get valid IDs)
- Vault endpoint may not be implemented (returns null)

### Tools not appearing in Claude Desktop
- Check config file path (see Claude Desktop Configuration above)
- Restart Claude Desktop
- Check logs: `~/Library/Logs/Claude/mcp*.log` (macOS)

### Integration tests fail
- Ensure API is running: `docker compose up -d`
- Wait for data collection: `docker compose logs -f collector`
- Check API health: `curl http://localhost:3000/api/pools`

---

## Limitations

⚠️ **This is a learning project - NOT financial advice.**

- Simplified risk model (educational purposes)
- No smart contract risk assessment
- No regulatory or legal risk
- Historical data only (no predictions)
- LLM explanations are informational, not authoritative
- Testnet deployment only (Sepolia)

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.

---

**Built as Phase 7 of Vault Risk Copilot - a portfolio project demonstrating DeFi, AI, and MCP integration.**
