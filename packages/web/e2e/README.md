# Playwright E2E Tests

## Setup

The E2E tests use Playwright to test the full vault workflow with real contracts deployed to Anvil.

### Prerequisites

- Foundry (forge, anvil) installed and in PATH
- Playwright browsers installed (`npx playwright install chromium`)

### Running E2E Tests

1. **Automated setup and test:**
   ```bash
   cd packages/web/e2e
   ./run-e2e.sh
   ```

   This script:
   - Starts Anvil local testnet
   - Deploys MockUSDC and SimpleVault contracts
   - Writes contract addresses to `.env.e2e.local`
   - Runs Playwright tests

2. **Manual setup (for debugging):**
   ```bash
   # Terminal 1: Start Anvil
   anvil --port 8545
   
   # Terminal 2: Deploy contracts
   cd contracts
   export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast
   
   # Terminal 3: Run tests
   cd packages/web
   # Copy addresses from deployment output to .env.e2e.local
   npm run test:e2e
   ```

## Test Structure

### `vault.spec.ts`

Tests the complete vault workflow:
1. Navigate to Pools page
2. Navigate to Vault page  
3. Connect wallet (mock connector with Anvil test account)
4. Mint test USDC tokens
5. Approve USDC for vault
6. Deposit USDC into vault
7. Verify shares received
8. Redeem shares
9. Verify balances updated

Screenshots are captured at each step and saved to `docs/screenshots/`.

## Mock Connector

The wagmi configuration (`src/lib/wagmi.ts`) supports a mock connector for E2E testing:

- Enabled via `VITE_ENABLE_MOCK_CONNECTOR=true`
- Uses Anvil test account #0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

## CI Integration

Add to GitHub Actions workflow:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - uses: foundry-rs/foundry-toolchain@v1
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: cd packages/web/e2e && ./run-e2e.sh
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-screenshots
        path: docs/screenshots/
```

## Troubleshooting

- **Contract addresses not found**: Ensure Anvil is running and contracts deployed successfully
- **Mock connector not available**: Check `.env.e2e.local` has `VITE_ENABLE_MOCK_CONNECTOR=true`
- **Wallet not connecting**: The mock connector should auto-connect; check browser console for errors
- **Transactions failing**: Verify Anvil is running on port 8545 and foundry chain ID is correct
