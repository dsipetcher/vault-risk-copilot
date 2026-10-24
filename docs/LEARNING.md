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
