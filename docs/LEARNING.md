# Learning Notes - Vault Risk Copilot

Key concepts and interview preparation for understanding the codebase.

## Phase 0 & 1: Repository Setup and Smart Contracts

### Key Concepts

#### 1. ERC-4626 Tokenized Vaults

**What is ERC-4626?**
- Standard interface for tokenized vaults (yield-bearing tokens)
- Depositors receive shares representing their portion of the vault
- Share price increases as yield is generated
- Standardizes deposit/withdraw/mint/redeem operations

**Core Functions:**
- `deposit(assets, receiver)` - Deposit assets, receive shares
- `mint(shares, receiver)` - Request specific share amount, pay assets
- `withdraw(assets, receiver, owner)` - Burn shares, withdraw assets
- `redeem(shares, receiver, owner)` - Burn shares, receive assets

**Conversion Functions:**
- `convertToShares(assets)` - How many shares for X assets?
- `convertToAssets(shares)` - How many assets for X shares?
- `previewDeposit/Mint/Withdraw/Redeem` - Simulate operation

**Why ERC-4626?**
- Interoperability across DeFi protocols
- Predictable behavior for integrators
- Composability (vault shares can be used in other protocols)

#### 2. Inflation/Donation Attack

**The Attack:**
1. Attacker deposits 1 wei (smallest unit) to get initial shares
2. Attacker donates large amount directly to vault (not via deposit)
3. Share price inflates massively: `pricePerShare = totalAssets / totalSupply`
4. Next depositor gets very few or zero shares due to rounding
5. Attacker redeems, stealing the depositor's funds

**Example:**
```
1. Attacker deposits 1 wei → gets 1 share
2. Attacker donates 10,000 USDC directly to vault
3. Share price = 10,000 USDC / 1 share = 10,000 USDC per share
4. Victim deposits 1,000 USDC → calculation: 1,000 / 10,000 = 0.1 shares → rounds to 0
5. Victim gets 0 shares, loses 1,000 USDC
6. Attacker redeems 1 share → gets all 11,000 USDC
```

**Mitigation (OpenZeppelin 5.x):**
- **Virtual Shares & Assets:** Add offset to initial supply
- `_decimalsOffset()` returns 3 → adds 1000 virtual shares
- Makes first deposit more expensive (need to mint against existing virtual supply)
- Breaks economic viability of the attack

**In SimpleVault:**
```solidity
function _decimalsOffset() internal pure override returns (uint8) {
    return 3; // Adds 10^3 = 1000 to supply calculations
}
```

This means:
- Initial deposit needs to overcome 1000 virtual shares
- Share price inflation requires much more capital
- Attack becomes economically infeasible

#### 3. Rounding Direction in ERC-4626

**Why Rounding Matters:**
- Division can't always be exact (e.g., 10 / 3 = 3.333...)
- Smart contracts must round to whole numbers
- Wrong rounding direction can be exploited

**ERC-4626 Standard Rules:**
- On **deposit/mint**: Round down shares (vault gets benefit of rounding)
- On **withdraw/redeem**: Round up shares burned (user gets benefit)

**Why?**
- Prevents users from extracting more than they put in via rounding
- Vault always solvent (never gives out more than it has)
- Users never lose access to their full deposit

**Example:**
```
User deposits 1000 USDC
Share price = 1.0001 USDC per share
Calculation: 1000 / 1.0001 = 999.9001 shares
Round DOWN: User gets 999 shares (not 1000)
Vault keeps 0.9001 shares worth as buffer
```

#### 4. Smart Contract Security Patterns

**Checks-Effects-Interactions:**
1. Checks: Validate inputs, permissions, state
2. Effects: Update state variables
3. Interactions: Call external contracts

Prevents reentrancy by updating state before external calls.

**Reentrancy Guard:**
```solidity
modifier nonReentrant() {
    require(!_locked, "Reentrant call");
    _locked = true;
    _;
    _locked = false;
}
```

**SafeERC20:**
- Handles non-standard ERC-20 tokens (USDT, etc.)
- Checks return values properly
- Prevents silent failures

**Access Control:**
- `Ownable2Step`: Two-step ownership transfer (accept required)
- Prevents accidental ownership loss
- `onlyOwner` modifier for privileged functions

**Pausable:**
- Emergency stop mechanism
- Pauses user-facing functions (deposit, withdraw)
- Owner can pause/unpause

#### 5. Solidity Version & Safety

**Solidity 0.8.x+ Features:**
- Built-in overflow/underflow protection
- No need for SafeMath library
- Cleaner, safer code

**Custom Errors (0.8.4+):**
```solidity
error DepositCapExceeded(uint256 requested, uint256 cap);
```
- Cheaper gas than string reverts
- Better debugging information

### Interview Questions & Answers

#### Q1: Explain the deposit flow in SimpleVault. What happens when a user deposits 1000 USDC?

**Answer:**
1. User calls `approve(vault, 1000 * 10^6)` on USDC contract
2. User calls `deposit(1000 * 10^6, userAddress)` on vault
3. Vault checks:
   - Not paused
   - Deposit cap not exceeded
   - Reentrancy guard set
4. Vault calculates shares: `shares = (assets * (totalSupply + virtual)) / (totalAssets + 1)`
5. Vault calls `transferFrom(user, vault, 1000 * 10^6)` on USDC
6. Vault mints shares to user
7. Vault emits `Deposit` event
8. Reentrancy guard cleared
9. Returns number of shares minted

The virtual shares from `_decimalsOffset()` protect against inflation attacks.

#### Q2: How does the harvest function work, and why can only the owner call it?

**Answer:**
`harvest(amount)` simulates yield generation:
1. Owner calls `harvest(100 * 10^6)` (100 USDC yield)
2. Vault calls `transferFrom(owner, vault, 100 * 10^6)`
3. Vault increments `totalHarvested` counter
4. `totalAssets()` increases (reads vault's USDC balance)
5. Share price increases: existing shareholders now own more underlying assets per share

**Why owner-only?**
- Prevents anyone from adding fake "yield"
- In real vault, this would be automated by strategy contracts
- Owner must have USDC to harvest (real yield in production)
- Simulates real yield for learning/demo purposes

**Real-world equivalent:**
A vault deploys USDC to Aave, earns interest, then "harvests" by withdrawing interest back to vault. This increases totalAssets without minting new shares.

#### Q3: What is the difference between deposit/mint and withdraw/redeem? When would you use each?

**Answer:**
**deposit(assets, receiver):**
- Specify asset amount you want to deposit
- Receive calculated shares
- Use when: You know how much you want to invest

**mint(shares, receiver):**
- Specify share amount you want to receive
- Pay calculated assets
- Use when: You want specific voting power or share amount

**withdraw(assets, receiver, owner):**
- Specify asset amount you want to withdraw
- Burn calculated shares
- Use when: You need specific dollar amount (e.g., $1000 for rent)

**redeem(shares, receiver, owner):**
- Specify share amount to burn
- Receive calculated assets
- Use when: You want to exit entire position (redeem all shares)

Most users use `deposit` and `withdraw` (asset-based). Advanced users use `mint` and `redeem` for specific strategies.

#### Q4: Explain the inflation attack and how OpenZeppelin's virtual shares prevent it.

**Answer:**
**Attack scenario (without protection):**
```
1. Vault empty: totalAssets = 0, totalSupply = 0
2. Attacker deposits 1 wei → gets 1 share (1:1)
3. Attacker donates 10,000 USDC directly to vault (not via deposit)
   totalAssets = 10,000 USDC, totalSupply = 1 share
4. Victim deposits 5,000 USDC
   Shares calculation: 5,000 * 1 / 10,000 = 0.5 → rounds DOWN to 0
5. Victim gets 0 shares, loses 5,000 USDC to vault
6. Attacker redeems: 1 share * 15,000 / 1 = 15,000 USDC
   Attacker profits 4,999 USDC (5,000 stolen - 1 wei cost)
```

**OZ virtual shares protection:**
```solidity
function _decimalsOffset() internal pure override returns (uint8) {
    return 3; // Adds 1000 virtual units
}
```

With offset:
```
1. totalSupply calculation includes +1000 virtual shares
2. Attacker deposits 1 wei → calculation: 1 * 1000 / 0 = 1000 shares
   But attacker only receives 1 real share (virtual shares stay in system)
3. Attacker donates 10,000 USDC
   totalAssets = 10,000, totalSupply = 1001 (1 real + 1000 virtual)
4. Victim deposits 5,000 USDC
   Shares: 5,000 * 1001 / 10,000 = 500.5 → victim gets 500 shares
5. Victim can redeem fairly
6. Attack fails - victim not diluted to zero
```

The offset makes the attack require 1000x more capital, making it economically impossible.

#### Q5: Why does SimpleVault use SafeERC20 instead of calling USDC.transfer directly?

**Answer:**
**Problem:** Not all ERC-20 tokens follow the standard exactly:
- **USDT** (Tether): `transfer` returns `void`, not `bool`
- **Some tokens**: Return `false` on failure instead of reverting
- **BNB** (old version): Similar non-standard behavior

**Without SafeERC20:**
```solidity
usdc.transfer(user, amount); // Might fail silently!
```
If USDC were replaced with USDT, `transfer` would succeed even if it failed internally.

**With SafeERC20:**
```solidity
usdc.safeTransfer(user, amount);
```
- Checks return value properly
- Reverts transaction if transfer failed
- Handles both standard and non-standard tokens
- Prevents silent failures that could lock funds

**In SimpleVault:** We use SafeERC20 for all token operations (`safeTransferFrom`, `safeTransfer`) to ensure compatibility if the underlying asset were changed from MockUSDC to a real token with non-standard behavior.

#### Q6: What is the purpose of the nonReentrant modifier, and where is it used?

**Answer:**
**Reentrancy attack:**
1. Malicious contract calls vault.withdraw()
2. Vault sends tokens to malicious contract
3. Malicious contract's `receive()` is triggered
4. Before vault updates state, malicious contract calls withdraw() again
5. Vault still thinks user has funds → sends again
6. Repeat until vault drained

**nonReentrant modifier:**
```solidity
uint256 private _status;

modifier nonReentrant() {
    require(_status != 2, "Reentrant");
    _status = 2;
    _;
    _status = 1;
}
```

**In SimpleVault:**
Used on ALL state-changing functions:
- `deposit` - prevents reentering during transferFrom
- `mint` - prevents reentering during transferFrom
- `withdraw` - prevents reentering during transfer
- `redeem` - prevents reentering during transfer

**Order of modifiers matters:**
```solidity
function deposit(...) 
    nonReentrant  // First: Lock
    whenNotPaused // Then: Check pause
{ ... }
```
`nonReentrant` should be first to set the lock before any other checks.

**Why we need it despite following Checks-Effects-Interactions:**
External call to USDC might trigger unexpected callbacks. Even with good patterns, defense in depth is critical in DeFi.

#### Q7: How does the share price change over time, and who benefits from it?

**Answer:**
**Share price formula:**
```
sharePrice = totalAssets / totalSupply
```

**Scenario:**
```
Time T0:
- Alice deposits 1,000 USDC
- Gets 1,000 shares (initial 1:1 ratio, ignoring offset for simplicity)
- sharePrice = 1,000 / 1,000 = 1.0 USDC per share

Time T1 (After harvest):
- Owner calls harvest(100 USDC) - simulates yield
- totalAssets = 1,100 USDC
- totalSupply = 1,000 shares (unchanged)
- sharePrice = 1,100 / 1,000 = 1.1 USDC per share

Time T2 (Bob deposits):
- Bob deposits 1,100 USDC
- Gets: 1,100 / 1.1 = 1,000 shares
- totalAssets = 2,200 USDC
- totalSupply = 2,000 shares
- sharePrice = 2,200 / 2,000 = 1.1 USDC per share (unchanged)

Time T3 (Alice withdraws):
- Alice redeems 1,000 shares
- Gets: 1,000 * 1.1 = 1,100 USDC
- Alice's profit: 100 USDC (10% yield)
```

**Key insight:** Existing shareholders benefit from yield proportionally. New depositors buy in at current (higher) share price. Everyone owns their fair share of the vault.

#### Q8: What would happen if someone sent USDC directly to the vault address (not via deposit)?

**Answer:**
**What happens:**
1. USDC transfer succeeds (vault can receive tokens)
2. `totalAssets()` increases (it reads `usdc.balanceOf(vault)`)
3. `totalSupply` stays the same (no shares minted)
4. Share price increases: `totalAssets / totalSupply` goes up
5. Existing shareholders benefit (get more assets per share)
6. Sender gets nothing (no shares)

**Is this an attack?**
No, it's a "donation" that benefits all existing shareholders proportionally.

**Inflation attack variant:**
This is the "donation" step of the inflation attack (Q4), which is why virtual shares are critical.

**In production:**
Some vaults have mechanisms to "sweep" donated tokens separately, or treat them as yield. Our SimpleVault treats direct transfers as increasing totalAssets immediately.

**Recovery:**
If someone accidentally sent wrong token (not USDC), owner can use `emergencyWithdraw(token, to, amount)` to recover it. But owner CANNOT withdraw the vault's underlying USDC asset - that belongs to depositors.

#### Q9: Explain the role of depositCap and why it's important.

**Answer:**
**What it does:**
```solidity
uint256 public depositCap; // Max total assets
```
Prevents total deposits from exceeding a set limit.

**Checked in:**
```solidity
function _checkDepositCap(uint256 assets) internal view {
    if (depositCap == 0) return; // No cap
    if (currentAssets + assets > depositCap) revert DepositCapExceeded(...);
}
```

**Why it's important:**
1. **Risk Management:** Limit exposure during testing/early phase
2. **Strategy Capacity:** Real vaults have limited places to deploy capital efficiently
3. **Gradual Rollout:** Start with small cap, increase as confidence grows
4. **Circuit Breaker:** If something goes wrong, losses are capped
5. **Regulatory:** Some jurisdictions limit fund sizes

**In SimpleVault:**
- Set to 10M USDC at deployment
- Owner can change with `setDepositCap(newCap)`
- Can be set to 0 to remove cap
- Doesn't affect withdrawals (users can always exit)

**Real-world example:**
Yearn Finance vaults often have deposit caps on new strategies until they're battle-tested.

#### Q10: How would you test that the inflation attack mitigation actually works?

**Answer:**
**Test strategy (from SimpleVault.t.sol):**
```solidity
function test_InflationAttackMitigation() public {
    // Step 1: Attacker deposits minimum amount
    usdc.approve(vault, type(uint256).max);
    vault.deposit(1, attacker);
    
    // Step 2: Attacker donates large amount
    uint256 donationAmount = 1_000 * 10^6; // 1000 USDC
    usdc.transfer(address(vault), donationAmount);
    
    // Step 3: Victim deposits normally
    uint256 aliceDeposit = 1000 * 10^6;
    usdc.approve(vault, aliceDeposit);
    uint256 aliceShares = vault.deposit(aliceDeposit, alice);
    
    // Assertions:
    assertGt(aliceShares, 0); // Alice gets shares
    
    // Step 4: Alice withdraws
    uint256 withdrawn = vault.redeem(aliceShares, alice, alice);
    
    // Alice should get most of her deposit back
    assertGt(withdrawn, aliceDeposit * 99 / 100);
}
```

**What this proves:**
1. Alice gets non-zero shares despite donation
2. Alice can withdraw approximately her full deposit
3. Virtual shares prevent the attack

**Additional verification:**
- Run without `_decimalsOffset()` - test should fail
- Fuzz test with random donation amounts
- Invariant test: no user loses funds

**In production:**
- Formal verification of the virtual shares math
- Economic analysis of attack cost vs potential gain
- Historical testing on mainnet forks

---

## Phase 1 Completion Checklist

- [x] MockUSDC contract with 6 decimals
- [x] SimpleVault (ERC-4626) with all security features
- [x] Unit tests (30 tests covering basic functionality)
- [x] Fuzz tests (deposit/withdraw roundtrips)
- [x] Invariant tests (6 invariants, 256 runs each)
- [x] Inflation attack test & mitigation
- [x] Deployment script for Sepolia
- [x] Comprehensive README
- [x] CI/CD workflow (compile, test, lint, security)
- [x] Learning documentation with interview questions

**Test Results:**
- MockUSDC: 7/7 tests passing
- SimpleVault: 30/30 tests passing
- Invariant tests: 6/6 invariants hold across 3,840 random operations
- Total: 38/38 tests passing ✓

**Next Steps:**
Phase 2 will add data collection, database, and the risk scoring service.

---

## Phase 2: Data Layer (PostgreSQL, Collector, viem)

### Key Concepts

**1. PostgreSQL Schema Design**
- **Normalized tables:** `pool_snapshots`, `risk_scores`, `explanations`, `vault_state_snapshots`
- **Time-series data:** `snapshot_at` timestamps for trend analysis
- **Indexes:** Performance optimization for common queries (pool_id, snapshot_at, tvl)
- **JSONB type:** Flexible storage for `risk_factors` with PostgreSQL indexing support
- **Idempotent inserts:** `ON CONFLICT ... DO NOTHING` prevents duplicate data

**2. viem vs ethers.js**
- **viem** is TypeScript-native, tree-shakeable, and modular (smaller bundle size)
- Type-safe contract reads using `readContract()` with ABI
- Built-in support for multicall and batching
- Better performance: no BigNumber wrapper overhead
- Uses native `bigint` type from ES2020

**3. DeFi Metrics (DeFiLlama)**
- **TVL (Total Value Locked):** Total USD value in a protocol/pool
- **APY (Annual Percentage Yield):** Includes compounding
- **APY Base:** Yield from protocol fees/interest
- **APY Reward:** Yield from token incentives
- **IL (Impermanent Loss):** Loss from price divergence in AMM pools
- **Sigma (σ):** Standard deviation of APY (volatility measure)

**4. Data Collection Architecture**
- **Pull model:** Collector initiates requests on schedule (cron)
- **Idempotency:** Safe to re-run without duplicating data
- **Graceful shutdown:** SIGTERM/SIGINT handling for clean exit
- **Structured logging:** JSON logs for observability (pino)
- **Error isolation:** Network failures don't crash the service

**5. Docker Compose Networking**
- **Bridge network:** Containers can communicate via service names (DNS)
- **Health checks:** Dependencies wait for postgres to be ready
- **Volume mounts:** Dev mode with hot reload (`./packages/collector:/app`)
- **Multi-stage builds:** Smaller production images (build deps vs runtime deps)

### Interview Questions and Answers

#### Q1: Why use JSONB instead of separate columns for risk_factors in explanations table?

**Answer:**
JSONB provides flexibility for evolving schemas without migrations. As we add new risk factors or change the LLM output structure, we don't need to alter the table. JSONB supports:
- Indexing with GIN indexes for fast queries
- JSON path queries (`jsonb_path_query`)
- Validation at application level (zod schema)
- Backward compatibility (old records remain valid)

Trade-off: Slightly slower than typed columns, but acceptable for our read-heavy workload.

#### Q2: How does viem handle bigint values from Solidity uint256?

**Answer:**
viem returns Solidity `uint256` as JavaScript native `bigint` (ES2020+). This avoids:
- BigNumber wrapper overhead (ethers.js uses this)
- String serialization round-trips
- Custom arithmetic operations

For Postgres storage, we convert `bigint` to string and use `NUMERIC(78, 0)` type (max 2^256-1).

Example:
```typescript
const totalAssets: bigint = await client.readContract({
  address: vaultAddress,
  abi: VAULT_ABI,
  functionName: 'totalAssets',
});

// Convert for Postgres
const asString = totalAssets.toString(); // "1000000000"
```

#### Q3: What is the purpose of the `count` field in DeFiLlama pool data?

**Answer:**
`count` represents the number of historical data points DeFiLlama has for that pool. Higher count = more reliable data.

Example:
- `count = 7` → Only 7 days of history, new pool, higher uncertainty
- `count = 365` → Full year of data, mature pool, more reliable APY trends

We use this in risk scoring: lower count → higher "data age" risk score.

#### Q4: Explain the idempotency strategy in insertPoolSnapshot().

**Answer:**
```typescript
await sql`
  INSERT INTO pool_snapshots ${sql(snapshot)}
  ON CONFLICT (pool_id, snapshot_at) DO NOTHING
`;
```

The `UNIQUE` constraint on `(pool_id, snapshot_at)` prevents duplicate snapshots for the same pool at the same time. If a collector run fails and retries, it won't insert duplicates.

This is **idempotent:** running the same insert N times = running it once.

Alternative: `ON CONFLICT ... DO UPDATE` would overwrite, but we prefer preserving the first successful insert.

#### Q5: Why filter DeFiLlama pools to TVL ≥ $100k and APY ≤ 1000%?

**Answer:**
- **TVL ≥ $100k:** Filters out dust pools, rugpulls, and testing deployments. Adds liquidity context for risk assessment.
- **APY ≤ 1000%:** Filters out outliers, likely scams, or data errors. Real DeFi APY rarely exceeds 100-200% sustainably.
- **Top 100 after filtering:** Keeps dataset manageable for demo/learning project without overwhelming the database.

Production system would be more sophisticated (outlier detection, historical validation).

#### Q6: What is the purpose of `share_price` calculation in VaultReader?

**Answer:**
```typescript
const sharePrice = totalSupply > 0n 
  ? Number(totalAssets) / Number(totalSupply) 
  : undefined;
```

Share price tracks vault performance over time:
- `share_price = 1.0` → Initial state (1 asset = 1 share)
- `share_price = 1.5` → 50% yield accumulated
- `share_price < 1.0` → Vault lost value (bad harvest, hack, etc.)

This metric is **essential for dashboard charts** (historical performance) and **risk signals** (sudden drops indicate issues).

#### Q7: How does the cron scheduler work in collector/index.ts?

**Answer:**
```typescript
const intervalMinutes = Math.floor(config.COLLECTION_INTERVAL_MS / 60000);
const cronExpression = `*/${intervalMinutes} * * * *`;

cron.schedule(cronExpression, async () => {
  await collectData();
});
```

- Converts milliseconds to minutes
- Generates cron expression: `*/5 * * * *` = every 5 minutes
- Runs `collectData()` on schedule
- Also runs once immediately on startup

**Cron format:** `minute hour day month weekday`

#### Q8: Why separate pool_snapshots and risk_scores tables?

**Answer:**
**Separation of concerns:**
- `pool_snapshots` = raw data from external APIs (immutable, append-only)
- `risk_scores` = computed metrics from our model (can be recalculated/versioned)

Benefits:
1. Can re-score historical snapshots without re-fetching data
2. Can A/B test different risk models on same snapshots
3. `model_version` field tracks which algorithm generated the score
4. Cleaner data lineage (raw → processed → presented)

This is **event sourcing pattern** applied to data pipeline.

#### Q9: What is the advantage of using postgres client over pg or Prisma?

**Answer:**
**`postgres` library advantages:**
- **Tagged template literals:** SQL injection safe, readable syntax
- **Automatic type inference:** TypeScript infers result types from SQL
- **Smaller bundle:** No ORM overhead
- **Performance:** Pipelining support, connection pooling

Trade-offs:
- Less abstraction than Prisma (no auto-generated types, migrations)
- More SQL knowledge required
- Better for **data-intensive workloads** where SQL control matters

Prisma/TypeORM better for **CRUD-heavy apps** with many models.

#### Q10: How would you handle DeFiLlama API rate limits in production?

**Answer:**
**Current implementation:**
- No rate limiting (relies on DeFiLlama's generosity + 5-minute intervals)
- User-Agent header for identification

**Production improvements:**
1. **Exponential backoff:** On 429 (rate limit) or 5xx errors, wait and retry
2. **Circuit breaker:** Stop requests if API consistently fails
3. **Caching:** Store last successful response, serve stale data if API down
4. **Incremental updates:** Fetch only changed pools (if API supports it)
5. **Pagination:** Fetch in batches to avoid large responses
6. **Monitoring:** Alert on API errors, latency spikes

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  await sleep(retryAfter * 1000);
  // retry with exponential backoff
}
```

---

## Phase 2 Completion Checklist

- [x] PostgreSQL schema (4 tables, indexes, constraints)
- [x] Database migrations in SQL
- [x] Docker Compose for all services
- [x] TypeScript Collector service
- [x] viem integration for on-chain reads
- [x] DeFiLlama API integration with filtering
- [x] Zod configuration validation
- [x] Pino structured logging
- [x] Unit tests (5 tests for config)
- [x] TypeScript strict mode (typecheck passing)
- [x] npm build successful
- [x] CI/CD jobs (collector, docker)
- [x] README and documentation

**Test Results:**
- Collector unit tests: 5/5 passing ✓
- TypeScript typecheck: No errors ✓
- Build: Successful ✓

**Next Steps:**
Phase 3 will add the Python Risk Service with scikit-learn for explainable risk scoring.

---

## Phase 3: Python Risk Service - Q&A for Python Newcomers

### Q1: What is FastAPI and why use it over Flask?

**Answer:**
**FastAPI** is a modern Python web framework for building APIs.

**Advantages over Flask:**
1. **Automatic API documentation:** OpenAPI (Swagger) and ReDoc generated from code
2. **Type hints + validation:** Uses Pydantic models for request/response validation
3. **Async support:** Built on ASGI (Starlette), supports `async/await` natively
4. **Performance:** Faster than Flask (comparable to Node.js, Go)
5. **Editor support:** Better autocomplete from type hints

**Example:**
```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/")
async def create_item(item: Item):  # Type hint + validation
    return {"name": item.name, "price": item.price}
```

**When to use Flask:** Simple prototypes, existing Flask ecosystem, synchronous-only code.

---

### Q2: What is Pydantic v2 and why use it?

**Answer:**
**Pydantic** is a data validation library using Python type hints.

**Key features:**
- **Runtime validation:** Validates data matches declared types
- **Serialization:** Convert models to dict/JSON
- **IDE support:** Type checkers and autocomplete work
- **Error messages:** Clear validation errors

**Pydantic v2 improvements (over v1):**
- **Much faster:** Core rewritten in Rust
- **Better error messages**
- **Stricter by default:** Less implicit coercion
- **`model_config` instead of `class Config`**

**Example:**
```python
from pydantic import BaseModel, Field, ValidationError

class User(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    age: int = Field(ge=0, le=120)

try:
    user = User(username="ab", age=150)  # Validation fails
except ValidationError as e:
    print(e.errors())  # Clear error messages
```

**Use case in risk-service:** All API request/response models are Pydantic for type safety.

---

### Q3: What is asyncpg and why not use psycopg2?

**Answer:**
**asyncpg** is an async PostgreSQL driver for Python.

**Comparison:**

| Feature | asyncpg | psycopg2 |
|---------|---------|----------|
| Async support | Yes (native) | No (blocking I/O) |
| Performance | Fastest Python Postgres driver | Slower |
| Connection pooling | Built-in | Requires psycopg2-pool |
| Type conversion | Efficient binary protocol | Text protocol |
| API style | Low-level (raw SQL) | Low-level or ORM (SQLAlchemy) |

**When to use asyncpg:**
- FastAPI with async endpoints
- High-throughput applications
- Raw SQL queries (no ORM)

**When to use psycopg2:**
- Django (not async)
- Sync-only code
- SQLAlchemy ORM (though SQLAlchemy 2.0 supports asyncpg)

**Example:**
```python
import asyncpg

async def fetch_users():
    conn = await asyncpg.connect("postgresql://user:pass@localhost/db")
    rows = await conn.fetch("SELECT * FROM users WHERE age > $1", 18)
    await conn.close()
    return rows
```

---

### Q4: What is ruff and why use it instead of pylint/flake8?

**Answer:**
**Ruff** is an extremely fast Python linter and formatter written in Rust.

**Features:**
- **Replaces:** flake8, isort, black, pylint (partially), pydocstyle
- **Speed:** 10-100x faster than alternatives
- **Configuration:** Single `[tool.ruff]` section in pyproject.toml
- **Rules:** Implements 700+ rules from popular tools

**Comparison:**

| Tool | Speed | Format | Lint | Config |
|------|-------|--------|------|--------|
| ruff | Fast | Yes | Yes | Simple |
| black | Medium | Yes | No | Limited |
| flake8 | Slow | No | Yes | Complex |
| pylint | Very slow | No | Yes | Complex |

**Example pyproject.toml:**
```toml
[tool.ruff]
line-length = 100
select = ["E", "F", "I", "B"]  # pycodestyle, pyflakes, isort, bugbear
ignore = ["E501"]  # Allow long lines

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["B018"]  # Allow assert without message in tests
```

**Commands:**
```bash
ruff check .            # Lint
ruff check --fix .      # Auto-fix
ruff format .           # Format
```

**Use case in risk-service:** Single tool for linting and formatting, fast in CI.

---

### Q5: What is mypy and why use strict mode?

**Answer:**
**mypy** is a static type checker for Python.

**What it does:**
- Analyzes code without running it
- Checks type hints match actual usage
- Catches bugs before runtime

**Strict mode benefits:**
```toml
[tool.mypy]
strict = true  # Enables all strict flags
```

**Strict flags:**
- `disallow_untyped_defs`: All functions must have type hints
- `disallow_any_generics`: `list` not allowed, must be `list[int]`
- `warn_return_any`: Functions returning `Any` trigger warning
- `no_implicit_optional`: `x: str = None` is error, must be `x: str | None`

**Example:**
```python
# Without mypy, this runs but is wrong
def add(a, b):  # mypy error: Missing type hints
    return a + b

result = add("hello", 5)  # Runtime error: can't add str + int

# With mypy
def add(a: int, b: int) -> int:
    return a + b

result = add("hello", 5)  # mypy error: Expected int, got str
```

**Trade-offs:**
- **Pro:** Catches bugs early, better IDE support, self-documenting
- **Con:** More verbose, requires learning type system (generics, unions, etc.)

**Use case in risk-service:** `strict = true` ensures all code is fully typed, no `Any` escapes.

---

### Q6: What is the difference between `async def` and `def` in Python?

**Answer:**
**`async def`** defines a coroutine function (asynchronous).

**Key differences:**

| `def` (sync) | `async def` (async) |
|-------------|---------------------|
| Blocks thread | Yields to event loop |
| Returns value | Returns coroutine object |
| Call with `func()` | Call with `await func()` |
| Can't use `await` | Can use `await` |

**When to use async:**
- I/O-bound operations: database queries, HTTP requests, file reads
- High concurrency (many requests at once)
- FastAPI with async endpoints

**When NOT to use async:**
- CPU-bound operations (use multiprocessing instead)
- Libraries that don't support async (blocking code)
- Simple scripts (async adds complexity)

**Example:**
```python
# Sync (blocks for 5 seconds)
def fetch_data():
    time.sleep(5)
    return "data"

# Async (yields to event loop)
async def fetch_data():
    await asyncio.sleep(5)  # Other tasks can run during this
    return "data"

# Usage
result = fetch_data()  # Sync: blocks
result = await fetch_data()  # Async: concurrent
```

**In risk-service:**
- Database queries: `async def fetch_pool_snapshots()` → `await db.pool.fetch(...)`
- FastAPI endpoints: `async def list_risk_scores()` → handles many requests concurrently

---

### Q7: What is pandas and when should you use it?

**Answer:**
**pandas** is a Python library for data manipulation and analysis.

**Core concepts:**
- **Series:** 1D array with labels (like a column)
- **DataFrame:** 2D table (rows + columns)

**When to use pandas:**
- ✅ Data cleaning and transformation
- ✅ Statistical analysis
- ✅ CSV/Excel/SQL data loading
- ✅ Time-series analysis
- ✅ Exploratory data analysis

**When NOT to use pandas:**
- ❌ Real-time APIs (overhead for single-row operations)
- ❌ Large-scale data (>1GB in memory → use Dask/Polars)
- ❌ Simple calculations (NumPy or plain Python is faster)

**Example:**
```python
import pandas as pd

# Create DataFrame
data = {"pool_id": ["A", "B", "C"], "apy": [5.0, 10.0, 15.0]}
df = pd.DataFrame(data)

# Filter
high_apy = df[df["apy"] > 7.5]

# Aggregate
mean_apy = df["apy"].mean()
```

**In risk-service:**
- **Not used in production code** (risk_engine.py uses plain Python for speed)
- **Could be used** for batch analysis, historical backtesting, or exploratory notebooks

---

### Q8: What is scikit-learn's IsolationForest and how does it work?

**Answer:**
**IsolationForest** is an unsupervised anomaly detection algorithm.

**How it works:**
1. Build random trees that recursively split data
2. Anomalies are easier to isolate (fewer splits needed)
3. Score = path length to isolate a point
4. Short path = anomaly, long path = normal

**Intuition:**
- Normal points are clustered → hard to isolate
- Outliers are far from clusters → easy to isolate

**Parameters:**
- `contamination`: Expected fraction of anomalies (e.g., 0.05 = 5%)
- `random_state`: Seed for reproducibility

**Example:**
```python
from sklearn.ensemble import IsolationForest
import numpy as np

# Data: 100 normal + 5 outliers
X = np.concatenate([np.random.randn(100, 2), np.random.randn(5, 2) * 5])

model = IsolationForest(contamination=0.05, random_state=42)
predictions = model.fit_predict(X)
# predictions: 1 = normal, -1 = anomaly
```

**In risk-service:**
- Detects pools with unusual combinations of TVL, APY, volatility
- Requires ≥10 pools for meaningful results
- Flags ~5% as anomalies (configurable)

**Limitations:**
- No interpretability (doesn't explain *why* it's an outlier)
- Sensitive to feature scaling
- Needs enough data for statistical significance

---

### Q9: What is the difference between `list[str]` and `list[str] | None` in Python type hints?

**Answer:**
**Type union syntax:**

| Syntax | Meaning | Accepts | Rejects |
|--------|---------|---------|---------|
| `list[str]` | List of strings | `["a", "b"]`, `[]` | `None`, `["a", 1]` |
| `list[str] \| None` | List or None | `["a"]`, `None` | `["a", 1]`, `1` |
| `list[str \| None]` | List of str/None | `["a", None]` | `None` (the list itself), `[1]` |

**Before Python 3.10:**
```python
from typing import Optional, Union

x: Optional[list[str]]  # list[str] | None
y: Union[int, str]      # int | str
```

**Python 3.10+ (preferred):**
```python
x: list[str] | None  # Cleaner syntax
y: int | str
```

**Example:**
```python
def fetch_pools(ids: list[str] | None = None) -> list[dict]:
    if ids is None:
        # Fetch all pools
        return fetch_all()
    else:
        # Fetch specific pools
        return fetch_by_ids(ids)
```

**In risk-service:**
- API parameters: `pool_ids: list[str] | None` (optional filter)
- Database results: `tvl_usd: Decimal | None` (nullable column)
- mypy enforces null checks before using optional values

---

### Q10: What is pytest's `pytest.mark` and how do you use it?

**Answer:**
**`pytest.mark`** is a decorator for organizing and selecting tests.

**Common markers:**
- `@pytest.mark.unit`: Unit tests (no external dependencies)
- `@pytest.mark.integration`: Integration tests (database, APIs)
- `@pytest.mark.slow`: Tests that take >1 second
- `@pytest.mark.asyncio`: Async tests (requires pytest-asyncio)
- `@pytest.mark.skip(reason="...")`: Skip test
- `@pytest.mark.parametrize`: Run test with multiple inputs

**Configuration (pyproject.toml):**
```toml
[tool.pytest.ini_options]
markers = [
    "unit: Unit tests without external dependencies",
    "integration: Integration tests requiring database",
]
```

**Usage:**
```python
import pytest

@pytest.mark.unit
def test_calculation():
    assert 2 + 2 == 4

@pytest.mark.integration
@pytest.mark.asyncio
async def test_database():
    result = await db.fetch("SELECT 1")
    assert result == [(1,)]

@pytest.mark.parametrize("a,b,expected", [(1, 2, 3), (5, 5, 10)])
def test_add(a, b, expected):
    assert a + b == expected  # Runs 2 times
```

**Running specific markers:**
```bash
pytest -m unit              # Only unit tests
pytest -m "not integration" # Exclude integration tests
pytest -m "unit and slow"   # Both markers
```

**In risk-service:**
- `pytest -m unit` in CI (fast, no database)
- `pytest` locally (all tests, with DATABASE_URL)
- `pytest -k "tvl"` (run tests matching "tvl")

---

## Phase 3 Completion Checklist

- [x] Python 3.12 environment with modern tooling (ruff, mypy, pytest)
- [x] FastAPI application with typed endpoints
- [x] Pydantic v2 models for request/response validation
- [x] asyncpg database connection with connection pooling
- [x] Transparent risk scoring engine (7 signals + anomaly detection)
- [x] Unit tests for each signal function (pytest)
- [x] Integration tests for database operations
- [x] API tests with httpx
- [x] Docker multi-stage build (builder + runtime)
- [x] CI/CD job (ruff, mypy, pytest)
- [x] docker-compose integration (risk-service enabled)
- [x] Smoke test: assert risk_scores > 0 and API calls succeed
- [x] Comprehensive RISK_MODEL.md documentation
- [x] Python learning Q&A (10 questions)

**Test Results:**
- Unit tests: Pending local run
- Integration tests: Require DATABASE_URL
- Smoke test: Pending CI run

**Key Learnings:**
- Async Python patterns (`async def`, `await`, asyncpg)
- Modern Python tooling (ruff > black+flake8, pydantic v2, mypy strict)
- FastAPI lifecycle management (startup/shutdown with `lifespan`)
- Explainable ML (deterministic formulas > black-box models)
- PostgreSQL connection pooling and prepared statements
<<<<<<< HEAD

---

## Phase 6: LLM Risk Explanations - Q&A

### Q1: Why bring-your-own-key (BYOK) instead of server-side API keys?

**Answer:**
**Security reasons:**
1. **Liability:** Server storing user API keys = responsible for breaches and security incidents
2. **Trust:** Users don't have to trust us with $$$-worth API keys
3. **Cost control:** User controls their own LLM spend, no surprise bills
4. **Privacy:** User's prompts/responses never touch our logs (only metadata)

**Why NOT store keys server-side:**
- **Attack surface:** Encrypted keys at rest still require decryption keys somewhere
- **Insider risk:** Admins with DB access could extract keys
- **Regulatory complexity:** Additional security requirements and audit obligations
- **Vendor lock-in:** Users can switch providers without migrating data

**Trade-off:**
- ❌ **UX friction:** Users must enter key each time (unless they opt into localStorage)
- ✅ **Zero trust:** We never see the key, can't be stolen from us

**In production:** Session-based storage (memory) by default, opt-in localStorage with clear warning.

---

### Q2: What is SSRF and how does baseUrl validation prevent it?

**Answer:**
**SSRF (Server-Side Request Forgery):** Attacker tricks server into making HTTP requests to internal services.

**Attack scenario:**
```
User sends: POST /api/pools/123/explain
Body: { "provider": "ollama", "baseUrl": "http://169.254.169.254/metadata" }

Server makes request to AWS metadata service (intended for EC2 instances only)
→ Leaks IAM credentials, instance role tokens, etc.
```

**Our defense (validateBaseUrl):**
1. **Allowlist:** Only https://api.openai.com, https://openrouter.ai, https://api.groq.com
2. **Localhost exception:** http://localhost allowed ONLY in NODE_ENV=development (for Ollama)
3. **Block:**
   - Private IP ranges (10.x, 192.168.x, 172.16-31.x)
   - Cloud metadata endpoints (169.254.169.254, fd00:ec2::254)
   - Internal .local domains

**Why this works:**
- Attacker can't target our internal services (Redis, Postgres, Admin APIs)
- Attacker can't scan internal network from our server
- Legitimate Ollama users (localhost) only work in dev mode

---

### Q3: Why pass API key in header (X-LLM-Api-Key) instead of body?

**Answer:**
**HTTP best practice:** Credentials in headers, data in body.

**Benefits:**
1. **Separation of concerns:** Authentication (header) vs parameters (body)
2. **Logging safety:** Most logging libraries auto-redact `Authorization`-like headers
3. **Caching:** HTTP caches ignore headers, include body in cache key
4. **OpenAPI clarity:** `security: [{ ApiKeyAuth: [] }]` vs custom body field

**Body would be dangerous:**
```json
// BAD: Key in body
{ "provider": "openai", "apiKey": "sk-secret" }

// Logged by default in many frameworks
// Sent to analytics (Sentry, Datadog)
// Cached in Redis with full body as key
```

**Header is safer:**
```
X-LLM-Api-Key: sk-secret

// Most loggers redact headers with "key", "token", "auth" in name
// Not included in cache keys
// Clear separation from business logic
```

---

=======
# React 19 & wagmi Integration: Q&A

## 1. What is React 19 and what are its main improvements?

**Answer:** React 19 (released 2026) is the latest major version focusing on performance and developer experience:
- **Automatic batching** for all state updates (not just event handlers)
- **Improved TypeScript support** with better inference
- **useOptimistic hook** for optimistic UI updates
- **useFormState** and **useFormStatus** for form handling
- **Server Components** maturity (though we use client-side only)

In this project, we use React 19's improved TypeScript integration with strict typing.

## 2. What is wagmi and how does it relate to viem?

**Answer:** 
- **wagmi** is a collection of React Hooks for Ethereum, built on top of viem
- **viem** is a low-level TypeScript library for interacting with Ethereum (lightweight alternative to ethers.js)
- wagmi provides:
  - `useAccount` - get connected wallet address and chain
  - `useConnect` / `useDisconnect` - wallet connection management
  - `useReadContract` - read blockchain data with automatic caching
  - `useWriteContract` - send transactions
  - `useWaitForTransactionReceipt` - wait for tx confirmation

Relationship: wagmi wraps viem with React hooks and adds caching, auto-refetch, and connection management.

## 3. How do you configure wagmi for multiple chains (anvil local and Sepolia testnet)?

**Answer:** In `src/lib/wagmi.ts`:

```typescript
import { createConfig, http } from 'wagmi';
import { sepolia, foundry } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [foundry, sepolia],  // foundry = anvil (chainId 31337)
  connectors: [
    injected(),  // MetaMask, Rabby, etc.
    walletConnect({ projectId: '...' })  // optional
  ],
  transports: {
    [foundry.id]: http(),  // uses default http://localhost:8545
    [sepolia.id]: http(),  // uses public Sepolia RPC
  },
});
```

The user's wallet determines which chain is active. We support both for local testing (anvil) and testnet deployment (Sepolia).

## 4. What is the difference between `useReadContract` and `useWriteContract`?

**Answer:**

- **`useReadContract`**: 
  - Calls view/pure functions (read-only, no gas)
  - Returns data immediately
  - Cached by TanStack Query
  - Example: `balanceOf(address)`, `totalAssets()`

- **`useWriteContract`**:
  - Sends transactions (costs gas, requires wallet signature)
  - Returns transaction hash
  - Need to use `useWaitForTransactionReceipt` to wait for confirmation
  - Example: `approve(spender, amount)`, `deposit(assets)`

```typescript
// Read example
const { data: balance } = useReadContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [userAddress],
});

// Write example
const { writeContract, data: txHash } = useWriteContract();
const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [VAULT_ADDRESS, amount],
});
```

## 5. How do you handle transaction states (pending, confirmed, error)?

**Answer:** Combine `useWriteContract` and `useWaitForTransactionReceipt`:

```typescript
const { writeContract, data: txHash, isPending, error } = useWriteContract();
const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
  hash: txHash,
});

// States:
// 1. User clicks → isPending = true (wallet popup)
// 2. User signs → isPending = false, txHash available, isConfirming = true
// 3. Block confirmed → isConfirming = false, isSuccess = true
// 4. If error → error object populated
```

We show:
- `isPending` → "Waiting for signature..."
- `isConfirming` → "Transaction pending..."
- `isSuccess` → "Success! Refetch balances"
- `error` → Display error message

## 6. What is the approve + deposit pattern and why is it needed?

**Answer:** ERC-20 tokens require two-step pattern for third-party spending:

1. **Approve**: User approves vault to spend their USDC
   ```solidity
   usdc.approve(vault, amount)
   ```

2. **Deposit**: Vault transfers USDC from user and mints shares
   ```solidity
   vault.deposit(amount, receiver)
   ```

Why? Security! Without approval, any contract could drain your tokens. The approval gives explicit permission for a specific amount.

In our UI:
- Check `allowance(user, vault)` with `useReadContract`
- If `allowance < depositAmount`, show "Approve" button first
- After approval success, show "Deposit" button

## 7. How does TanStack Query (@tanstack/react-query) integrate with wagmi?

**Answer:** wagmi uses TanStack Query under the hood for caching and auto-refetch:

- **Automatic caching**: Same `useReadContract` call uses cached data
- **Auto-refetch**: On window focus, network reconnect, or interval
- **Stale-while-revalidate**: Shows cached data while fetching fresh data in background
- **Query keys**: wagmi generates keys from contract address + function + args

We also use TanStack Query directly for API calls:

```typescript
export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => apiClient.getPools(),
    refetchInterval: 60000,  // refetch every 60s
  });
}
```

Benefits:
- Loading/error/success states automatic
- Deduplication (multiple components calling same hook = 1 request)
- Cache invalidation on mutation

## 8. What is the difference between `parseUnits` and `formatUnits` in viem?

**Answer:**

- **`parseUnits(value, decimals)`**: Convert human-readable string to BigInt
  ```typescript
  parseUnits('100.5', 6)  // USDC has 6 decimals
  // → 100500000n (BigInt)
  ```

- **`formatUnits(bigint, decimals)`**: Convert BigInt to human-readable string
  ```typescript
  formatUnits(100500000n, 6)
  // → '100.5'
  ```

Why? Solidity uses integers for token amounts to avoid floating-point precision issues.

- USDC: 6 decimals (1 USDC = 1,000,000 units)
- Vault shares: 18 decimals (ERC-4626 standard)
- ETH: 18 decimals (1 ETH = 10^18 wei)

## 9. How do you handle wallet not connected state in the UI?

**Answer:** Use `useAccount` hook:

```typescript
const { address, isConnected, chain } = useAccount();
const { connect, connectors } = useConnect();
const { disconnect } = useDisconnect();

if (!isConnected) {
  return (
    <div>
      {connectors.map((connector) => (
        <button key={connector.id} onClick={() => connect({ connector })}>
          Connect with {connector.name}
        </button>
      ))}
    </div>
  );
}

// User is connected, show main UI
return <VaultUI address={address} chain={chain} />;
```

We:
1. Check `isConnected` first
2. Show connection buttons if false
3. Display connected address with `shortenAddress(address)` helper
4. Add "Disconnect" button in header

## 10. How do you refetch on-chain data after a successful transaction?

**Answer:** Two approaches:

**Approach 1: Manual refetch (our implementation)**
```typescript
const { refetch: refetchBalance } = useReadContract({ ... });
const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

if (isSuccess) {
  setTimeout(() => {
    refetchBalance();
    refetchShares();
    refetchAllowance();
  }, 2000);  // wait 2s for indexing
}
```

**Approach 2: Watch events (more advanced)**
```typescript
useWatchContractEvent({
  address: VAULT_ADDRESS,
  abi: VAULT_ABI,
  eventName: 'Deposit',
  onLogs(logs) {
    refetchBalance();
  }
});
```

We use Approach 1 for simplicity. The `setTimeout` is a workaround because blocks may take 1-2 seconds to propagate.

---

## Additional Resources

- [wagmi docs](https://wagmi.sh/)
- [viem docs](https://viem.sh/)
- [TanStack Query docs](https://tanstack.com/query/latest)
- [ERC-4626 standard](https://eips.ethereum.org/EIPS/eip-4626)
>>>>>>> origin/main
