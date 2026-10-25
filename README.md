# Vault Risk Copilot

**A testnet-only learning project demonstrating DeFi concepts, ERC-4626 vaults, risk analytics, and AI integration.**

[![CI](https://github.com/username/vault-risk-copilot/workflows/CI/badge.svg)](https://github.com/username/vault-risk-copilot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ⚠️ Disclaimer

**THIS IS A LEARNING PROJECT - NOT FINANCIAL ADVICE**

- 🧪 **Testnet only** - Deployed on Sepolia, no mainnet usage
- 📚 **Educational purpose** - Built to demonstrate technical skills
- 🚫 **No financial advice** - Risk signals are for learning, not investment decisions
- 💸 **No real funds** - Never use with production wallets or mainnet

---

## What is This?

Vault Risk Copilot is a full-stack DeFi application that:

1. **📊 Analyzes Real DeFi Pools** - Fetches data from live protocols (read-only) and calculates explainable risk signals
2. **🏦 Custom ERC-4626 Vault** - Implements a simple yield vault on Sepolia testnet with security best practices
3. **🤖 AI-Powered Explanations** - Uses LLMs to explain risk factors in plain language (structured, validated output)
4. **🔌 MCP Integration** - Exposes read-only tools for AI agents to query pool risk and vault state

## Architecture

```
┌─────────────┐   REST/JSON   ┌──────────────┐  HTTP   ┌────────────────┐
│ React + TS  │ ────────────► │ Node.js API  │ ──────► │ Python Risk    │
│ (Vite,      │               │ (TypeScript, │         │ Service        │
│ wagmi/viem) │               │ zod, OpenAPI)│         │ (FastAPI)      │
└──────┬──────┘               └──┬────┬──────┘         └───────┬────────┘
       │ wallet (Sepolia)        │    │ SQL                    │ SQL
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
- Provider-agnostic LLM integration (OpenAI, Anthropic, etc.)
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

**Current Phase 2 includes:** PostgreSQL + Collector service

```bash
# Clone the repository
git clone https://github.com/username/vault-risk-copilot.git
cd vault-risk-copilot

# Start services (postgres + collector)
docker compose up

# Or run in background
docker compose up -d

# View logs
docker compose logs -f collector

# Verify data collection
docker compose exec postgres psql -U vault_user -d vault_risk_copilot \
  -c "SELECT COUNT(*) FROM pool_snapshots;"
```

**Services running:**
- **PostgreSQL:** localhost:5432 (auto-applies migrations on first start)
- **Collector:** Runs every 5 minutes, fetches DeFiLlama pools + on-chain vault state

**Future services** (Phase 3-5, currently commented in docker-compose.yml):
- API (http://localhost:3000)
- Risk Service (http://localhost:8000)
- Frontend (http://localhost:5173)
- MCP Server (http://localhost:3001)

### Running Tests

```bash
# Smart contracts
cd contracts
forge test

# Collector tests
cd packages/collector
npm install
npm test

# Future services (not yet implemented)
# npm run test:api
# npm run test:web
# pytest (in packages/risk-service)
```

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

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0-1 | ✅ Complete | Smart contracts (ERC-4626 vault), tests, CI/CD |
| Phase 2 | ✅ Complete | PostgreSQL schema, Docker Compose, TypeScript collector |
| Phase 3 | 🚧 Planned | Python Risk Service (FastAPI, scikit-learn) |
| Phase 4 | 🚧 Planned | Node.js API + React frontend |
| Phase 5 | 🚧 Planned | LLM integration + MCP server |
| Phase 6 | 🚧 Planned | DevOps hardening, Kubernetes |

**See:** [docs/phases/](./docs/phases/) for detailed phase status and history

## Smart Contracts on Sepolia

Deployed contracts (Sepolia testnet):

| Contract | Address | Etherscan |
|----------|---------|-----------|
| MockUSDC | `TBD` | [View](https://sepolia.etherscan.io/address/TBD) |
| SimpleVault | `TBD` | [View](https://sepolia.etherscan.io/address/TBD) |

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

**MCP Server (Read-Only):**
- `list_pools` - Get available pools with basic info
- `get_pool_risk` - Retrieve risk score and factors for a pool
- `explain_pool` - Get AI explanation of pool risk
- `get_vault_state` - Query Sepolia vault state (TVL, share price)

**No transaction signing** - MCP server is read-only by design.

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
