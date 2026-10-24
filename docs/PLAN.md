# Vault Risk Copilot - Implementation Plan

**Date:** October 24, 2026  
**Purpose:** Portfolio/learning project for Full Stack Developer position (DeFi protocol)

## Project Overview

Vault Risk Copilot is a **testnet-only educational project** demonstrating:
1. Real DeFi pool analytics with explainable risk signals (read-only data)
2. Custom ERC-4626 vault deployed on Sepolia with React UI
3. LLM-powered risk explanations (structured, validated)
4. Read-only MCP server for AI agent integration

**DISCLAIMER:** This is NOT a financial product. No financial advice. Testnet only. No mainnet deployments or real funds.

## Technology Stack & Versions

All versions verified on **October 24, 2026**.

### Smart Contracts
- **Solidity:** 0.8.28 (latest stable)
- **Foundry:** v1.8.6 (verified from GitHub releases)
- **OpenZeppelin Contracts:** 5.6.1 (with ERC-4626 virtual shares protection)

### Frontend
- **React:** 19.3.1
- **TypeScript:** 7.0.2
- **Vite:** 8.3.5
- **viem:** 2.57.11
- **wagmi:** 3.7.9
- **zod:** 4.6.7

### Backend (Node.js API)
- **Node.js:** 22.23.4 (current LTS)
- **TypeScript:** 7.0.2
- **Fastify:** 5.12.7
- **zod:** 4.6.7

### Risk Service (Python)
- **Python:** 3.12.3
- **FastAPI:** Latest stable (to be pinned in requirements.txt)
- **pandas:** Latest stable
- **scikit-learn:** Latest stable

### MCP
- **@modelcontextprotocol/sdk:** 1.32.2 (verified from npm registry)

### Infrastructure
- **PostgreSQL:** 16 (Docker image)
- **Docker:** Required but not yet installed in environment
- **GitHub Actions:** For CI/CD

### Testnet
- **Sepolia:** Current recommended Ethereum application testnet (per ethereum.org, Oct 2026)
  - Note: Sepolia replacement planned for 2027, but still active and recommended

## Repository Structure

```
vault-risk-copilot/
├── contracts/              # Solidity contracts (Foundry project)
│   ├── src/
│   │   ├── SimpleVault.sol
│   │   └── MockUSDC.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── packages/
│   ├── api/               # Node.js backend API
│   ├── web/               # React frontend
│   ├── risk-service/      # Python FastAPI service
│   ├── collector/         # Data collection service
│   └── mcp/               # MCP server
├── docs/
│   ├── PLAN.md           # This file
│   ├── LEARNING.md       # Key concepts & interview questions
│   ├── ROADMAP.md        # Future improvements
│   └── architecture.svg  # Architecture diagram
├── infra/
│   ├── docker/
│   └── k8s/              # Optional Kubernetes manifests
├── .github/
│   └── workflows/
├── docker-compose.yml
├── .env.example
├── README.md
└── SECURITY.md
```

## Implementation Phases

### Phase 0: Setup ✓ (Current)
- [x] Create repository structure
- [x] Verify and document all tool versions
- [x] Create .gitignore
- [x] Create .env.example
- [x] Set up basic CI (lint)
- [ ] Create architecture diagram

**DoD:** CI green, structure ready, versions documented

### Phase 1: Smart Contracts (1-1.5 weeks)
- [ ] MockUSDC (ERC-20, 6 decimals, mint for testing)
- [ ] SimpleVault (ERC-4626 with security features)
- [ ] Unit tests (deposits, withdrawals, shares calculation)
- [ ] Fuzz tests (deposit/redeem roundtrip)
- [ ] Invariant tests (total assets consistency)
- [ ] Inflation attack test & mitigation verification
- [ ] Slither static analysis
- [ ] Deploy to Sepolia
- [ ] Verify on Etherscan

**DoD:** `forge test` passing, Slither clean, deployed & verified on Sepolia

### Phase 2: Data Layer (1 week)
- [ ] PostgreSQL schema & migrations
- [ ] Collector service (DeFiLlama API + viem on-chain reads)
- [ ] Data storage (pool snapshots)
- [ ] Idempotent updates
- [ ] Error handling

**DoD:** Data collecting on schedule, tests passing

### Phase 3: Risk Service (1-1.5 weeks)
- [ ] Feature extraction (TVL, APY volatility, reward ratio, etc.)
- [ ] Risk score calculation (transparent formula)
- [ ] Anomaly detection (z-score / IsolationForest)
- [ ] FastAPI endpoints
- [ ] Documentation of formula & limitations
- [ ] Unit tests

**DoD:** pytest passing, formula documented, manually verified on 3 examples

### Phase 4: API & Frontend (1.5-2 weeks)
- [ ] Node.js API with Fastify
- [ ] OpenAPI specification
- [ ] React dashboard (pool list, risk display)
- [ ] Wallet connection (wagmi)
- [ ] Vault interaction UI (approve, deposit, redeem)
- [ ] Transaction status handling
- [ ] Error handling (wrong network, insufficient allowance, etc.)
- [ ] E2E tests

**DoD:** End-to-end flow works manually, error cases handled

### Phase 5: AI & MCP (1 week)
- [ ] LLM integration (provider-agnostic)
- [ ] Structured output with zod validation
- [ ] Prompt injection defenses
- [ ] Eval set (10-30 test cases)
- [ ] MCP server (read-only tools)
- [ ] MCP client testing

**DoD:** Eval set passes, MCP tools work in client

### Phase 6: DevOps & Hardening (1 week)
- [ ] Multi-stage Dockerfiles
- [ ] docker-compose setup
- [ ] Full CI/CD pipeline
- [ ] Secret scanning
- [ ] Dependency auditing
- [ ] Security checklist
- [ ] Optional: k8s manifests + kind testing

**DoD:** `docker compose up` works from scratch, CI passes on clean clone

### Phase 7: Documentation & Demo (3-5 days)
- [ ] Complete README
- [ ] SECURITY.md with threat model
- [ ] Architecture diagram
- [ ] Demo video
- [ ] Deploy frontend
- [ ] LEARNING.md with interview questions

**DoD:** Someone can run the project from README in ≤15 minutes

## Security Checklist

- [ ] No secrets in repository
- [ ] .env.example provided (no real values)
- [ ] Testnet-only deployments
- [ ] Input validation (zod/pydantic on all inputs)
- [ ] Rate limiting on API
- [ ] CORS allowlist
- [ ] Helmet security headers
- [ ] SSRF protection (no arbitrary URLs)
- [ ] npm audit / pip-audit passing
- [ ] Dependabot enabled
- [ ] Version pinning in lock files
- [ ] Reentrancy protection in contracts
- [ ] Access control in contracts
- [ ] Pausable functionality
- [ ] Deposit caps
- [ ] ERC-4626 rounding handled correctly
- [ ] Inflation attack mitigation verified
- [ ] Non-standard ERC-20 handling
- [ ] Events logged
- [ ] Slither checks passing
- [ ] Prompt injection defenses
- [ ] LLM API key not leaked
- [ ] Token limits on LLM
- [ ] No PII in logs
- [ ] MCP server read-only (no transaction signing)
- [ ] Disclaimer in README
- [ ] SECURITY.md with threat model

## Data Sources

- **DeFiLlama Yields API:** https://yields.llama.fi/pools (check terms and rate limits)
- **On-chain reads:** Read-only via viem on mainnet (public RPC endpoints)
- **Testnet:** Sepolia for vault deployment

## Notes & Constraints

1. **Educational project:** Must be explainable in interview
2. **No fabricated metrics:** All numbers from real runs
3. **Honest AI disclosure:** README includes which parts were AI-generated
4. **Version changes:** If tools/docs conflict with this plan, update plan first
5. **Scope control:** Additional ideas go to ROADMAP.md, not implemented yet

## Success Criteria

- Working monorepo with passing CI
- Deployed & verified vault on Sepolia
- Deployed web demo
- Complete documentation
- Security checklist complete
- Can explain every line of code in interview
