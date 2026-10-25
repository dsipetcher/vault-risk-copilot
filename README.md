# Vault Risk Copilot

**A testnet-only learning project demonstrating DeFi concepts, ERC-4626 vaults, risk analytics, and AI integration.**

[![CI](https://github.com/dsipetcher/vault-risk-copilot/workflows/CI/badge.svg)](https://github.com/dsipetcher/vault-risk-copilot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ⚠️ Disclaimer

**THIS IS A LEARNING PROJECT - NOT FINANCIAL ADVICE**

- 🧪 **Testnet / local Anvil only** - Not deployed to a public Sepolia instance; no mainnet usage
- 📚 **Educational purpose** - Built to demonstrate technical skills
- 🚫 **No financial advice** - Risk signals are for learning, not investment decisions
- 💸 **No real funds** - Never use with production wallets or mainnet

---

## What is This?

Vault Risk Copilot is a full-stack DeFi application that:

1. **📊 Analyzes Real DeFi Pools** - Fetches data from live protocols (read-only) and calculates explainable risk signals
2. **🏦 Custom ERC-4626 Vault** - `MockUSDC` + `SimpleVault` for local Anvil (not deployed publicly)
3. **🤖 AI-Powered Explanations** - Uses LLMs to explain risk factors in plain language (structured, validated output)
4. **🔌 MCP Integration** - Exposes read-only tools for AI agents to query pool risk and vault state

## Architecture

```
┌─────────────┐   REST/JSON   ┌──────────────┐  HTTP   ┌────────────────┐
│ React + TS  │ ────────────► │ Node.js API  │ ──────► │ Python Risk    │
│ (Vite,      │               │ (TypeScript, │         │ Service        │
│ wagmi/viem) │               │ zod, OpenAPI)│         │ (FastAPI)      │
└──────┬──────┘               └──┬────┬──────┘         └───────┬────────┘
       │ wallet (Anvil/Sepolia)  │    │ SQL                    │ SQL
       ▼                         │    ▼                        ▼
┌─────────────┐   viem read     │ ┌──────────────────────────────┐
│ ERC-4626    │ ◄───────────────┘ │ PostgreSQL                   │
│ SimpleVault │                   │ (snapshots, scores, logs)    │
│ (Foundry)   │                   └──────────────▲───────────────┘
└─────────────┘                                  │ ingest
                                                 │
┌──────────────┐  read-only   ┌──────────────────┴──┐
│ MCP Server   │ ◄──────────  │ Collector (Node/Go) │
│ (TypeScript) │   tools      │ + viem              │
└──────────────┘              └─────────────────────┘
                                     │
                                     ├─► DeFiLlama Yields API
                                     └─► On-chain (mainnet, read-only)
```

## Technology Stack

### Smart Contracts
- **Solidity 0.8.28** with Foundry
- **OpenZeppelin 5.6.1** (ERC-4626, SafeERC20, access control)
- Unit, fuzz, and invariant tests
- Slither static analysis

### Frontend
- **React 19** + **TypeScript 5.9** + **Vite 7**
- **wagmi 3.7** + **viem 2.57** for Web3 interactions
- **Playwright** E2E tests with screenshot capture
- TanStack Query for data fetching
- Recharts for visualization

## Screenshots

### Pools Dashboard
![Pools Page](docs/screenshots/01-pools-page.png)

### Vault Interface - Connected
![Vault Connected](docs/screenshots/03-vault-connected.png)

### After Minting Test USDC
![After Mint](docs/screenshots/04-after-mint.png)

### After Approving USDC
![After Approve](docs/screenshots/05-after-approve.png)

### After Depositing USDC to Vault
![After Deposit](docs/screenshots/06-after-deposit.png)

### After Redeeming Vault Shares
![After Redeem](docs/screenshots/07-after-redeem.png)

### Final Vault State
![Final State](docs/screenshots/08-final-state.png)

### AI Risk Explanation (Phase 6)
![Explain Panel](docs/screenshots/09-explain-panel.png)

### Backend
- **Node.js 22** + **TypeScript 5.9**
- **Fastify 5** API with zod validation
- OpenAPI documentation
- Rate limiting & security headers

### Risk Service
- **Python 3.12** + **FastAPI**
- **pandas** + **scikit-learn** for risk scoring
- Explainable features (TVL, APY volatility, reward ratio, etc.)

### Infrastructure
- **PostgreSQL 16** for data storage
- **Docker** + **docker-compose** for local development
- **GitHub Actions** for CI/CD

### AI & MCP
- Provider-agnostic LLM integration (Groq, OpenAI, OpenRouter, Ollama, mock)
- Per-provider default models (Groq uses `openai/gpt-oss-120b` unless you set `LLM_MODEL`)
- **MCP** (Model Context Protocol) server with read-only tools
- Structured output validation with zod
- Prompt injection defenses

## Quick Start

### Prerequisites

- Node.js 22+
- Python 3.12+
- Docker & Docker Compose
- Git

### Docker Compose (Recommended)

A fresh clone following these steps brings up Postgres, the collector, the risk service, the API, and the web UI. Risk scores are computed automatically after the first collection (and every 5 minutes after that).

```bash
# Clone the repository
git clone https://github.com/dsipetcher/vault-risk-copilot.git
cd vault-risk-copilot

# Create a local env file (do not commit it)
cp .env.example .env

# Generate a 32-byte AES key for SIWE-encrypted LLM key storage
# Compose also has a local-only fallback if this is left empty.
# Do NOT set DATABASE_URL in .env when using compose (see comments in .env.example).
printf '\nLLM_KEY_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" >> .env

# Start the full stack
docker compose up --build

# Or run in background
docker compose up --build -d

# View logs
docker compose logs -f collector
docker compose logs -f risk-service

# Verify snapshots + auto-computed risk scores (usually within a few minutes)
docker compose exec postgres psql -U vault_user -d vault_risk_copilot \
  -c "SELECT COUNT(*) AS snapshots FROM pool_snapshots;"
docker compose exec postgres psql -U vault_user -d vault_risk_copilot \
  -c "SELECT COUNT(*) AS scores FROM risk_scores;"
```

**Services running:**
- **PostgreSQL:** localhost:5432 (auto-applies migrations on first start)
- **Collector:** Runs immediately, then every 5 minutes; fetches DeFiLlama pools and triggers risk recompute
- **API:** http://localhost:3000 (Node.js REST API)
- **API docs:** http://localhost:3000/docs (OpenAPI at `/docs/openapi.json`)
- **Risk Service:** internal to the compose network only (no host port). Debug with `docker compose exec risk-service ...`
- **Frontend:** http://localhost:5173 (React + Vite)

**SIWE defaults** match the web app (`localhost:5173`, Anvil `31337` and Sepolia `11155111`). Connect a wallet on the UI and sign in — no extra env is required for local login.

### Local ERC-4626 vault (Anvil)

The public GitHub Pages demo does **not** include a live vault. `MockUSDC` and `SimpleVault` are not deployed to Sepolia.

To deposit and redeem locally:

1. Start the stack with `docker compose up --build` (API + web).
2. In another terminal, run Anvil: `anvil --port 8545`.
3. Deploy from [`contracts/`](./contracts):

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast
```

4. Set `VITE_VAULT_ADDRESS` and `VITE_USDC_ADDRESS` (or `VAULT_ADDRESS` / `MOCK_USDC_ADDRESS` for compose) to the printed addresses and reload the web app.

Or run the Playwright helper, which starts Anvil, deploys, and writes `.env.e2e.local`:

```bash
cd packages/web/e2e && ./run-e2e.sh
```

Contract source: [`contracts/src/SimpleVault.sol`](./contracts/src/SimpleVault.sol) and [`contracts/src/MockUSDC.sol`](./contracts/src/MockUSDC.sol).

**Groq:** set `LLM_PROVIDER=groq` and `LLM_API_KEY=...` (or paste the key in LLM Settings). You do not need to set a model; the default is `openai/gpt-oss-120b`.

**MCP Server** (run separately after the API is up):
```bash
cd packages/mcp
npm ci
npm run build
API_BASE_URL=http://localhost:3000 npm start
```
HTTP transport binds `127.0.0.1` by default (`npm run start:http`). See [packages/mcp/README.md](./packages/mcp/README.md) for Claude Desktop / Cursor setup.

### Running Tests

```bash
# Smart contracts
cd contracts
forge test

# Collector
cd packages/collector && npm ci && npm test

# API (needs Postgres + DATABASE_URL; CI uses the mock LLM provider)
cd packages/api && npm ci && npm test

# Web
cd packages/web && npm ci && npm test

# LLM package
cd packages/llm && npm ci && npm test

# Risk service
cd packages/risk-service && pip install -r requirements-dev.txt && pytest -m unit

# MCP
cd packages/mcp && npm ci && npm test
```

CI runs the same suites plus a compose smoke test (mock LLM, no real API keys).

### Manual Development (without Docker)

**Collector only:**
```bash
# 1. Start PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=vault_user \
  -e POSTGRES_PASSWORD=vault_pass_local \
  -e POSTGRES_DB=vault_risk_copilot \
  postgres:16-alpine

# 2. Apply migrations
psql postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot \
  -f db/migrations/001_initial_schema.sql

# 3. Run collector
cd packages/collector
npm install
export DATABASE_URL="postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot"
npm run dev
```

## Project Status

The stack through MCP is implemented and covered by GitHub Actions (unit, integration, compose smoke, Playwright).

| Area | Status | Description |
|------|--------|-------------|
| Smart contracts | ✅ | ERC-4626 vault, Foundry unit/fuzz/invariant tests, CI |
| Data + risk | ✅ | Postgres, collector, FastAPI risk service, auto-recompute |
| API + web | ✅ | Fastify API, React UI, SIWE, BYOK LLM, pagination |
| LLM | ✅ | Groq / OpenAI / OpenRouter / Ollama / mock with per-provider defaults |
| MCP | ✅ | Local stdio/HTTP server (not published to npm) |

**See:** [docs/phases/](./docs/phases/) for historical phase notes.

## Smart Contracts

`MockUSDC` and `SimpleVault` are **not deployed publicly** (no Sepolia addresses). They exist for local Anvil and CI.

To run them locally, follow [Local ERC-4626 vault (Anvil)](#local-erc-4626-vault-anvil). Source lives in [`contracts/`](./contracts).

## Features

### 🔍 Risk Analysis

The risk scoring system evaluates pools based on:

- **TVL Level & Change** - Total value locked and 7-day trend
- **APY Volatility** - Standard deviation and recent fluctuations
- **Reward Composition** - Ratio of incentive rewards to base yield
- **Asset Type** - Stablecoin vs volatile assets
- **Impermanent Loss Risk** - For AMM pools
- **Anomaly Detection** - Statistical outliers using z-score and IsolationForest

**Limitations:** This is a simplified model for learning. It does NOT:
- Predict future yields or prices
- Account for smart contract risk
- Consider market conditions or regulatory risk
- Constitute financial advice

### 🏦 ERC-4626 Vault

`SimpleVault` implements the full ERC-4626 standard with:

- ✅ Deposit/withdraw/mint/redeem functions
- ✅ Share price calculations with correct rounding
- ✅ Protection against inflation/donation attacks (via OZ virtual shares)
- ✅ Pausable functionality
- ✅ Deposit cap
- ✅ Role-based access control
- ✅ Harvest function (owner-only, simulates yield)
- ✅ SafeERC20 for token operations
- ✅ Comprehensive test suite (unit, fuzz, invariant)

**Security:** See [SECURITY.md](./SECURITY.md) for the threat model and security measures.

### 🤖 AI Features

**LLM Risk Explanations:**
- Generates human-readable explanations of risk factors
- Structured output with schema validation
- Uses only data from the input (no hallucination of numbers)
- Prompt injection defenses
- No financial advice in output

**Sign-In With Ethereum (SIWE) Authentication:**
- Connect wallet and authenticate via EIP-4361 standard
- Server-side encrypted LLM API key storage per wallet
- AES-256-GCM encryption with master key rotation support
- httpOnly session cookies with 7-day expiry
- Replay protection and domain validation
- **See [docs/SIWE_AUTH.md](./docs/SIWE_AUTH.md) for security model and threat analysis**

**MCP Server (Read-Only, Phase 7):**
- `list_pools` - Get available pools with filters (chain, protocol, min TVL)
- `get_pool_risk` - Retrieve risk score breakdown and 7-day history
- `compare_pools` - Compare 2-5 pools side-by-side
- `explain_pool_risk` - Get AI explanation of pool risk (LLM-powered or fallback)
- `get_vault_info` - Query local vault state when deployed (TVL, share price); explains the public-demo gap otherwise

**Resources:**
- `methodology://risk-signals` - Risk model documentation

**Prompts:**
- `assess_pool_risk` - Pre-built assessment workflow

**No transaction signing** - MCP server is read-only by design.

**Configuration:** See [packages/mcp/README.md](./packages/mcp/README.md) for Claude Desktop and Cursor integration.

## Roadmap

See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned features:

- [ ] Multi-chain support (Arbitrum, Optimism)
- [ ] Historical risk tracking & charts
- [ ] Backtesting framework for risk signals
- [ ] Advanced ML models (gradient boosting)
- [ ] User portfolio tracking
- [ ] Alert system for risk changes
- [ ] Go-based collector (performance)
- [ ] Kubernetes deployment

## Learning Resources

This project was built to learn and demonstrate:

1. **ERC-4626 Vault Mechanics** - See [docs/LEARNING.md](./docs/LEARNING.md) for key concepts
2. **DeFi Protocols** - Lending (Aave, Compound), AMMs (Uniswap), yield aggregation
3. **Smart Contract Security** - Reentrancy, access control, rounding attacks
4. **Web3 Integration** - wagmi/viem for wallet connection and contract interaction
5. **Risk Modeling** - Feature engineering and explainable ML
6. **AI Safety** - Prompt injection, structured outputs, validation
7. **DevOps** - Docker, CI/CD, testing strategies

## AI Assistance

**Transparency:** This project was built with AI assistance using Cursor Agent (Claude). The codebase is **AI-generated and currently under owner review**.

**AI-Generated:**
- Smart contract implementation (MockUSDC, SimpleVault)
- Test suite (unit, fuzz, invariant tests)
- Project structure and configuration
- OpenZeppelin and Foundry integration
- Documentation and guides

**Owner Status:** The repository owner has not yet completed a full review. This is a portfolio/learning project demonstrating AI-assisted development capabilities. All code should be considered AI-generated until the owner confirms review and understanding.

## Contributing

This is a learning project and not actively maintained for production use. However, feedback and suggestions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- **OpenZeppelin** - Secure smart contract library
- **Foundry** - Ethereum development toolkit
- **DeFiLlama** - DeFi data aggregation
- **MCP** - Model Context Protocol by Anthropic
- **Cursor** - AI-powered development environment

---

**Built as a portfolio project for learning DeFi, smart contracts, and AI integration.**

*Not affiliated with any DeFi protocol. Testnet only. Not financial advice.*
