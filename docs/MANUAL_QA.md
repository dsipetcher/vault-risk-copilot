# Phase 5: E2E Testing and Manual QA

## Date: 2026-10-24

### E2E Infrastructure Setup

#### Completed:
1. ✅ Installed Playwright and Chromium browser
2. ✅ Created E2E test structure in `packages/web/e2e/`
3. ✅ Added wagmi mock connector support for testing
4. ✅ Created deployment script for Anvil + contracts
5. ✅ Configured Playwright to use test environment variables
6. ✅ Added npm scripts: `test:e2e` and `test:e2e:ui`

#### E2E Test Scripts:
- `packages/web/e2e/run-e2e.sh` - Full automated setup (Anvil + contracts + tests)
- `packages/web/e2e/setup-env.sh` - Contract deployment only
- `packages/web/e2e/vault.spec.ts` - Main E2E test for vault workflow
- `packages/web/e2e/README.md` - E2E documentation

#### Known Issues:
- Playwright tests timing out waiting for page load
- React hydration appears to complete but h1 elements not visible to Playwright selectors
- API fetch errors showing on page load (expected, API not required for vault tests)
- Mock connector integration needs additional debugging for auto-connect behavior

### Manual Test Protocol

Until E2E automation is fully debugged, use this manual test protocol:

#### Setup:
```bash
# Terminal 1: Start Anvil
export PATH="$PATH:$HOME/.foundry/bin"
anvil --port 8545

# Terminal 2: Deploy contracts
cd /workspace/contracts  
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast

# Extract addresses from output:
# MockUSDC: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
# Vault: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9

# Terminal 3: Start frontend
cd /workspace/packages/web
cat > .env.local <<EOF
VITE_VAULT_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
VITE_USDC_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
VITE_ENABLE_MOCK_CONNECTOR=true
EOF
npm run dev
```

#### Test Steps:

1. **Navigate to Pools Page**
   - Open http://localhost:5173
   - Verify: Page loads, shows "DeFi Pools" or error message (expected if API offline)
   - Screenshot: `docs/screenshots/01-pools-page.png`

2. **Navigate to Vault Page**
   - Click "Vault" in navigation
   - Verify: Vault page loads
   - Screenshot: `docs/screenshots/02-vault-initial.png`

3. **Connect Wallet (Mock Connector)**
   - Click "Connect Wallet" button
   - Select "Mock" connector from list
   - Verify: Address `0xf39F...2266` shows in header
   - Screenshot: `docs/screenshots/03-wallet-connected.png`

4. **View Initial Balances**
   - Verify: USDC balance shows 0 or small amount
   - Verify: Vault shares balance shows 0
   - Screenshot: `docs/screenshots/04-initial-balances.png`

5. **Mint Test USDC**
   - Click "Mint 1000 USDC" button
   - Verify: Transaction succeeds (instant on Anvil)
   - Verify: USDC balance updates to 1000
   - Screenshot: `docs/screenshots/05-after-mint.png`

6. **Approve USDC for Vault**
   - Enter amount: 1000
   - Click "Approve" button
   - Verify: Transaction succeeds
   - Verify: Allowance updates
   - Screenshot: `docs/screenshots/06-after-approve.png`

7. **Deposit USDC to Vault**
   - Enter amount: 500
   - Click "Deposit" button
   - Verify: Transaction succeeds
   - Verify: USDC balance decreases to ~500
   - Verify: Vault shares balance increases to ~500
   - Screenshot: `docs/screenshots/07-after-deposit.png`

8. **Check On-Chain State (viem)**
   ```bash
   # In browser console or separate script:
   # - Vault totalAssets should be 500
   # - Vault totalSupply should be 500
   # - User's vault balance should be 500
   ```

9. **Redeem Vault Shares**
   - Enter shares: 250
   - Click "Redeem" button
   - Verify: Transaction succeeds
   - Verify: USDC balance increases to ~750
   - Verify: Vault shares balance decreases to ~250
   - Screenshot: `docs/screenshots/08-after-redeem.png`

10. **Final State Verification**
    - USDC balance: ~750
    - Vault shares: ~250
    - Vault totalAssets: ~250
    - Screenshot: `docs/screenshots/09-final-state.png`

### Test Results:

**Date**: 2026-10-24 14:45 UTC

**Test Environment**:
- Frontend: Vite dev server
- Blockchain: Anvil local testnet (chainId 31337)
- Contracts: MockUSDC, SimpleVault (freshly deployed)
- Wallet: Mock connector with Anvil test account #0

**Status**: ⚠️ Partial - E2E automation incomplete, manual testing required

**Bugs Found**:
1. Mock connector not auto-connecting in E2E (requires manual click)
2. Page hydration timing issues with Playwright selectors
3. API fetch errors displayed even when API not required for vault functionality

**Bugs Fixed**:
- None yet (E2E debugging in progress)

### Next Steps:
1. Debug Playwright selector timing/hydration issues
2. Investigate mock connector auto-connect behavior
3. Add visual regression testing for screenshots
4. Complete manual test protocol with actual screenshots
5. Add CI workflow with foundry-toolchain action

### CI Integration Plan:

```yaml
name: E2E Tests

on: [pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: foundry-rs/foundry-toolchain@v1
      - name: Install dependencies
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Run E2E tests
        run: cd packages/web/e2e && ./run-e2e.sh
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: packages/web/playwright-report/
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: screenshots
          path: docs/screenshots/
```
