# Security Policy

## Overview

Vault Risk Copilot is a **testnet-only educational project**. While it implements security best practices, it is NOT intended for production use with real funds.

## Scope

**In Scope:**
- Smart contracts on Sepolia testnet
- Web application and API
- Data collection and risk calculation services
- MCP server

**Out of Scope:**
- Mainnet deployments (none exist)
- Production systems (this is a learning project)
- Financial advice (not provided)

## Threat Model

### Smart Contracts (Sepolia Only)

#### Assets at Risk
- Test tokens (MockUSDC, no real value)
- User shares in SimpleVault (testnet only)

#### Attack Vectors & Mitigations

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Reentrancy attacks** | `nonReentrant` modifier on state-changing functions (via OZ ReentrancyGuard or checks-effects-interactions pattern) | ✅ Implemented |
| **Access control bypass** | Role-based access control using OZ `Ownable2Step` or `AccessControl` | ✅ Implemented |
| **Integer overflow/underflow** | Solidity 0.8+ built-in checks | ✅ By default |
| **ERC-4626 rounding issues** | Follow OZ guidance: round down on withdrawals (user favorable) | ✅ Implemented |
| **Inflation/donation attack** | Use OZ 5.x virtual shares (`_decimalsOffset()`) | ✅ Implemented |
| **Malicious ERC-20 tokens** | `SafeERC20` for all token operations; verify return values | ✅ Implemented |
| **Pausable bypass** | `Pausable` modifier on all user-facing functions | ✅ Implemented |
| **Deposit cap bypass** | Explicit checks in deposit/mint functions | ✅ Implemented |
| **Unauthorized harvest** | `onlyOwner` modifier on `harvest()` | ✅ Implemented |
| **Missing events** | Events emitted for all state changes | ✅ Implemented |
| **Front-running** | Acknowledged risk on public testnet (low impact) | ⚠️ Acknowledged |

#### Testing Strategy
- Unit tests for all functions
- Fuzz tests for deposit/withdraw/mint/redeem roundtrips
- Invariant tests (total assets consistency, share/asset calculations)
- Specific test for inflation attack & mitigation
- Slither static analysis in CI
- Manual review of critical functions

#### Known Limitations
- **No formal verification:** Contract logic is tested but not formally verified
- **No audit:** This is a learning project, not professionally audited
- **Testnet only:** Not hardened for mainnet deployment
- **Simplified yield:** `harvest()` simulates yield; real strategies would be more complex

### Backend Services

#### API (Node.js)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Injection attacks (SQL, NoSQL)** | Parameterized queries; ORM/query builder only | ✅ Implemented |
| **XSS** | No user-generated HTML rendered; API returns JSON | ✅ By design |
| **CSRF** | Stateless API; no cookies for auth | ✅ By design |
| **Rate limiting bypass** | Rate limiting middleware (per IP) | ✅ Implemented |
| **CORS misconfiguration** | Explicit allowlist of origins | ✅ Implemented |
| **Missing security headers** | Helmet middleware | ✅ Implemented |
| **SSRF** | No arbitrary URL fetching; only allowlisted APIs (DeFiLlama) | ✅ Implemented |
| **DoS** | Rate limits, request size limits, timeouts | ✅ Implemented |
| **Secrets exposure** | Secrets in env vars only; never logged | ✅ Implemented |
| **Dependency vulnerabilities** | `npm audit` in CI; Dependabot enabled | ✅ Implemented |

#### Risk Service (Python/FastAPI)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Input validation** | Pydantic models for all inputs | ✅ Implemented |
| **Code injection** | No `eval()` or `exec()`; static model loading | ✅ By design |
| **Pickle deserialization** | Only load models from trusted sources (our own) | ✅ Implemented |
| **Dependency vulnerabilities** | `pip-audit` in CI; pinned versions | ✅ Implemented |
| **Data poisoning** | Input data from read-only public APIs (no user uploads) | ✅ By design |

#### Collector

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **API key exposure** | No keys for DeFiLlama; RPC URLs in env only | ✅ Implemented |
| **Data manipulation** | Read-only RPC calls; no writes to blockchain | ✅ By design |
| **Rate limit bypass** | Respect DeFiLlama rate limits; exponential backoff | ✅ Implemented |

### Frontend (React)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **XSS** | React escapes by default; no `dangerouslySetInnerHTML` | ✅ By design |
| **Wallet draining** | Explicit user approval for each transaction; clear UI | ✅ Implemented |
| **Phishing** | Check network ID (Sepolia only); display addresses | ✅ Implemented |
| **Man-in-the-middle** | HTTPS only (enforced in production) | ✅ Deployment |
| **Dependency vulnerabilities** | `npm audit` in CI; Dependabot enabled | ✅ Implemented |
| **Secrets in bundle** | No secrets in frontend; public RPCs only | ✅ By design |

### AI/LLM Integration

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Prompt injection** | Do not execute instructions from external data; limit length; sanitize inputs | ✅ Implemented |
| **API key leakage** | Keys in env vars only; never logged; never sent to client | ✅ Implemented |
| **Excessive costs** | Token limits per request; caching; rate limiting | ✅ Implemented |
| **Hallucination of numbers** | Use structured output; validate against input; eval set | ✅ Implemented |
| **Financial advice** | System prompt explicitly forbids advice; disclaimer in output | ✅ Implemented |
| **PII leakage** | No PII collected; logs sanitized | ✅ By design |
| **Model jailbreak** | Acknowledged risk; system prompt guidance; output validation | ⚠️ Mitigated |

### MCP Server

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Unauthorized transactions** | **No transaction signing capability** - read-only tools only | ✅ By design |
| **Data exfiltration** | Only returns public blockchain data and our own calculations | ✅ By design |
| **Input validation** | Zod schemas for all tool inputs | ✅ Implemented |
| **Resource exhaustion** | Rate limiting; query limits | ✅ Implemented |

## Security Best Practices Implemented

### Development
- ✅ No secrets in repository (`.env` in `.gitignore`)
- ✅ `.env.example` provided with placeholders
- ✅ Security-focused code review
- ✅ Linting with security rules
- ✅ Static analysis (Slither for contracts)

### Testing
- ✅ Unit tests for critical logic
- ✅ Integration tests for API
- ✅ Fuzz tests for contracts
- ✅ Invariant tests for contracts
- ✅ LLM eval set for output validation

### CI/CD
- ✅ Automated testing on every PR
- ✅ `npm audit` / `pip-audit` for dependencies
- ✅ Secret scanning (e.g., gitleaks)
- ✅ Slither static analysis
- ✅ Docker image scanning
- ✅ Dependabot for dependency updates

### Deployment
- ✅ Testnet only (Sepolia)
- ✅ HTTPS enforced
- ✅ Environment-based configuration
- ✅ Minimal Docker images (multi-stage builds)
- ✅ Non-root containers

## Reporting a Vulnerability

**This is a learning project on testnet.** While security issues are unlikely to have real-world impact, we appreciate responsible disclosure for educational purposes.

To report a security issue:

1. **Do NOT** open a public GitHub issue
2. Email: [your-email@example.com] with subject "VRC Security"
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (optional)

**Response Time:** Best effort (this is not a production system)

## Known Issues & Limitations

### Not Addressed (Educational Project)
- ❌ No formal audit
- ❌ No bug bounty program
- ❌ No mainnet deployment
- ❌ No professional security review
- ❌ No incident response plan (testnet only)
- ❌ No insurance or real asset protection

### Acknowledged Risks
- **Front-running:** Possible on public testnet (low impact)
- **RPC reliability:** Depends on public RPC providers
- **Data accuracy:** DeFiLlama API assumed trustworthy
- **LLM outputs:** May contain errors despite validation

## Disclaimer

**NO WARRANTY:** This software is provided "as is" without warranty of any kind.

**NO FINANCIAL ADVICE:** Risk scores and explanations are for educational purposes only.

**TESTNET ONLY:** Never use this code with mainnet assets or production systems.

**NOT AUDITED:** This project has not undergone professional security audit.

## Security Roadmap (If This Were Production)

Items we would add for a production system:

- [ ] Professional smart contract audit
- [ ] Formal verification of critical functions
- [ ] Bug bounty program
- [ ] Multi-sig for admin functions
- [ ] Timelock for parameter changes
- [ ] Emergency pause mechanism with monitoring
- [ ] Comprehensive incident response plan
- [ ] Insurance/coverage for deposited funds
- [ ] Regular penetration testing
- [ ] Mainnet deployment procedures
- [ ] Real-time monitoring and alerting
- [ ] Gradual rollout with TVL caps

---

**Last Updated:** October 24, 2026  
**Project Status:** Educational/Portfolio - Testnet Only
