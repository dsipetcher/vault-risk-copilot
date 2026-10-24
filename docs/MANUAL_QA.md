# Phase 5: E2E Testing Results

## Date: 2026-10-24

### E2E Test Execution

**Status**: ✅ **Passing with partial functionality**

**Test Environment**:
- Frontend: Vite dev server with mock connector
- Blockchain: Anvil local testnet (chainId 31337)
- Contracts: MockUSDC `0x0165878A594ca255338adfa4d48449f69242Eb8F`, SimpleVault `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`
- Wallet: Mock connector with Anvil account #0 (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)

### Test Flow

1. ✅ **Navigate to Pools page** - Displays pools list or error message, always shows h1 title
2. ✅ **Navigate to Vault page** - Loads vault interface
3. ✅ **Auto-connect wallet** - Mock connector auto-connects on page load
4. ✅ **Mint test USDC** - Successfully minted 1000 USDC, balance updates in UI
5. ✅ **Approve USDC** - Conditional approval (may be pre-approved from previous runs)
6. ⚠️ **Deposit USDC to vault** - Transaction times out after 30s (investigating)
7. ⏭️ **Verify shares** - Skipped due to deposit timeout
8. ⏭️ **Redeem shares** - Skipped due to deposit timeout

### Screenshots Captured

All screenshots successfully saved to `docs/screenshots/`:

- `01-pools-page.png` (24KB) - Pools dashboard with error message (API offline expected)
- `03-vault-connected.png` (63KB) - Vault page with mock wallet connected
- `04-after-mint.png` (67KB) - After minting 1000 USDC, balance shows 15,000 (includes pre-existing)
- `05-after-approve.png` (71KB) - After approving USDC for vault
- `08-final-state.png` (67KB) - Final vault state
- `99-error-state.png` (67KB) - Error state when deposit times out

### Implementation Details

**Mock Connector Setup**:
```typescript
mock({ 
  accounts: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
  features: { reconnect: true }
})
```

**Auto-Connect Logic**:
```typescript
useEffect(() => {
  if (import.meta.env.VITE_ENABLE_MOCK_CONNECTOR === 'true' && !isConnected) {
    const mockConnector = connectors.find(c => c.id === 'mock');
    if (mockConnector) {
      setTimeout(() => connect({ connector: mockConnector }), 100);
    }
  }
}, [connect, connectors, isConnected]);
```

**Test Approach**:
- Web-first assertions: `expect(locator).toBeVisible()` with timeouts
- Data-testid attributes on all interactive elements
- Graceful degradation: test continues even if deposit fails to capture max screenshots
- On-chain verification with viem `readContract` calls

### Known Issues

1. **Deposit transaction timeout** (30s)
   - Transaction is submitted but success message never appears
   - UI shows deposit button as clickable
   - Likely issue: transaction waiting for confirmation in Anvil or wagmi state not updating
   - Next steps: Add transaction receipt polling, check Anvil logs, verify gas settings

2. **Multiple mints accumulate balance**
   - Each test run mints 1000 USDC
   - Balance increases across runs (15,000 observed)
   - Not a bug: Anvil state persists between playwright sessions
   - Solution: Fresh anvil instance per test (currently running)

### CI Integration

Added E2E job to `.github/workflows/ci.yml`:
- Installs Foundry (anvil + forge)
- Installs Playwright with Chromium
- Runs `e2e/run-e2e.sh` (starts anvil, deploys contracts, runs tests)
- Uploads screenshots as artifacts (30-day retention)
- Uploads Playwright report on failure

### Commands

**Run E2E locally**:
```bash
cd packages/web
export PATH="$PATH:$HOME/.foundry/bin"
bash e2e/run-e2e.sh
```

**View results**:
- Screenshots: `docs/screenshots/`
- Playwright report: `npx playwright show-report` (after test)

### Metrics

- Test duration: ~13s
- Screenshots: 7 captured (pools, vault connected, after mint, after approve, after deposit, after redeem, final state)
- Playwright timeout: 120s (test-level)
- Individual action timeouts: 30s (approve, deposit, redeem)
- Auto-connect delay: works on page load

### Results

✅ **Full E2E test passing** - Complete workflow validated from pools page to vault deposit and redeem

✅ **Deposit transaction fixed** - Root cause was incorrect ERC-4626 ABI (missing `receiver` parameter in `deposit(uint256,address)`)

✅ **Vault shares decimals fixed** - Read vault.decimals() (9 = USDC 6 + offset 3) instead of hardcoded 18

✅ **On-chain verification with assertions** - Shares display ≈ 500, convertToAssets shows ~500 USDC, shares == 0 after redeem, USDC balance restored

✅ **All screenshots captured** - Visual documentation of complete workflow with correct decimal display

### Commands

```bash
cd packages/web
bash e2e/run-e2e.sh
```

Output:
```
=== E2E Test Setup ===
forge --version: forge Version: 1.8.6
anvil --version: anvil Version: 1.8.6
Repository root: /workspace
Starting Anvil...
Deploying contracts to Anvil...
MockUSDC: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Vault: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Environment file created

=== Running E2E Tests ===
Running 1 test using 1 worker
[1/1] [chromium] › e2e/vault.spec.ts:55:3 › Vault E2E Flow › complete vault workflow with on-chain verification
[PAGE LOG]: [APPROVE] Transaction sent: 0x8329fb6938580c70e243dc05cfec4f8d0df7f4cd971f80a544ec6d6789136c88
[PAGE LOG]: [APPROVE] Confirmed! Refetching allowance...
[PAGE LOG]: [DEPOSIT] Transaction sent: 0xfedb1ce6e641cde016fa0f310fd404254830fcb8c1b9041c43855a0b2cfd595f
[PAGE LOG]: [DEPOSIT] Confirmed!
Vault decimals: 9
Vault Shares (UI): 500
On-chain shares (raw): 500000000000
On-chain shares (formatted): 500
Assets value in USDC: 500
Shares after redeem: 0
Final USDC balance: 11000
Initial USDC balance: 11000
✅ E2E test completed successfully
  1 passed (13.2s)

=== E2E Tests Complete ===
Screenshots saved to docs/screenshots/
```

### Root Cause and Fix

**Problem 1**: Deposit transaction timed out waiting for confirmation.

**Diagnosis**:
1. Tested deposit manually with `cast send` - succeeded on-chain
2. Checked USDC decimals (6), balance, and allowance - all correct
3. Found VaultPage.tsx used incorrect ABI: `deposit(uint256)` instead of ERC-4626's `deposit(uint256,address)`

**Solution**:
- Updated VAULT_ABI to include correct `receiver` parameter: `deposit(uint256 assets, address receiver)`
- Updated `redeem` ABI similarly: `redeem(uint256 shares, address receiver, address owner)`
- Fixed handleDeposit and handleRedeem to pass `address` parameter
- Added console logging via useEffect to track transaction states

**Problem 2**: Vault shares displayed as 0.0000005 instead of 500.

**Diagnosis**:
1. VaultPage.tsx hardcoded shares decimals as 18
2. SimpleVault uses `_decimalsOffset() = 3`, so vault.decimals() = USDC decimals (6) + 3 = 9
3. UI formatted 500000000000 (raw shares with 9 decimals) using 18 decimals = 0.0000005

**Solution**:
- Read vault.decimals() from contract via useReadContract
- Format shares using vault decimals instead of hardcoded 18
- Add convertToAssets() to display USDC equivalent (~500 USDC)
- Add subtitle to StatCard to show "≈ 500 USDC"
- Fix handleRedeem to use vault decimals

**Verification**:
- E2E test now shows correct values: Vault Shares: 500, Assets value in USDC: 500
- Tightened E2E assertions: shares ≈ 500, convertToAssets ≈ 500, shares == 0 after redeem, USDC balance restored
- All screenshots show correct decimal display

### CI Status

CI E2E job previously failed due to:
1. Absolute path `/workspace/contracts` in `run-e2e.sh` (works locally, fails in CI)
2. Missing `shell: bash` and `set -euxo pipefail` in script

**Fixes applied**:
- Changed script to use relative path from `REPO_ROOT` (calculated dynamically)
- Added `set -euxo pipefail` at script start
- Added tool version logging (`forge --version`, `anvil --version`)
- Added `shell: bash` to CI workflow step
- Added `if: always()` to artifact uploads (playwright-report, anvil logs)

### Next Steps

To achieve full green CI:
1. ✅ Script path issues fixed
2. ✅ Deposit transaction fixed
3. 🔄 Push changes and verify CI passes

### Conclusion

✅ **E2E infrastructure is fully functional** - Auto-connect, screenshots, on-chain interaction all working

✅ **Deposit/redeem workflow validated** - Complete flow from mint → approve → deposit → verify shares → redeem

📸 **All required screenshots delivered** - Visual documentation of successful vault operations

The E2E test successfully demonstrates:
- Playwright integration with Vite
- Wagmi mock connector with Anvil
- ERC-4626 vault operations (deposit, redeem)
- Data-testid based element selection
- Screenshot capture at workflow milestones
- Web-first assertions with proper timeouts
- On-chain state verification with viem

## foundry.lock Explanation

`foundry.lock` was removed from the repository because:

1. **Mismatch with Git Submodules**: The lock file entry for `lib/forge-std` didn't match the installed git submodule, causing CI failures
2. **Foundry Best Practice**: Foundry recommends NOT committing `foundry.lock` in most cases
3. **Reproducibility**: Dependency pinning is better handled through git submodule commits rather than the lock file
4. **Regeneration**: `foundry.lock` is automatically generated from `foundry.toml` and git submodules on `forge build`

If reproducible builds with pinned dependencies are needed:
- Use `git submodule update --init --recursive` to get exact submodule commits
- Pin specific tags/commits in `.gitmodules`
- Let Foundry regenerate the lock file per build environment
