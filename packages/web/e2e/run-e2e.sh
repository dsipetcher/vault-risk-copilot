#!/bin/bash
set -e

echo "=== E2E Test Setup ==="

# Check if anvil is running
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "Anvil already running on port 8545"
  ANVIL_PID=$(lsof -Pi :8545 -sTCP:LISTEN -t)
else
  echo "Starting Anvil..."
  anvil --port 8545 > /tmp/anvil.log 2>&1 &
  ANVIL_PID=$!
  echo "Anvil PID: $ANVIL_PID"
  sleep 3
fi

echo "Deploying contracts to Anvil..."
cd /workspace/contracts

# Set deployer private key for the script
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Deploy with anvil test account #0
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://localhost:8545 \
  --broadcast \
  2>&1 | tee /tmp/deploy.log

# Extract addresses from deployment
MOCK_USDC_ADDRESS=$(grep -oP "MOCK_USDC_ADDRESS= \K0x[a-fA-F0-9]{40}" /tmp/deploy.log | head -1)
VAULT_ADDRESS=$(grep -oP "VAULT_ADDRESS= \K0x[a-fA-F0-9]{40}" /tmp/deploy.log | head -1)

if [ -z "$MOCK_USDC_ADDRESS" ] || [ -z "$VAULT_ADDRESS" ]; then
  echo "ERROR: Failed to extract contract addresses"
  cat /tmp/deploy.log
  exit 1
fi

echo "MockUSDC: $MOCK_USDC_ADDRESS"
echo "Vault: $VAULT_ADDRESS"

# Write .env.e2e.local for Vite
cd /workspace/packages/web
cat > .env.e2e.local <<EOF
VITE_MOCK_USDC_ADDRESS=$MOCK_USDC_ADDRESS
VITE_VAULT_ADDRESS=$VAULT_ADDRESS
VITE_USDC_ADDRESS=$MOCK_USDC_ADDRESS
VITE_ENABLE_MOCK_CONNECTOR=true
VITE_API_URL=http://localhost:3000
EOF

echo "Environment file created"

echo ""
echo "=== Running E2E Tests ==="

# Export env vars for Playwright
export VITE_VAULT_ADDRESS=$VAULT_ADDRESS
export VITE_USDC_ADDRESS=$MOCK_USDC_ADDRESS
export VITE_ENABLE_MOCK_CONNECTOR=true

npm run test:e2e

echo ""
echo "=== E2E Tests Complete ==="
echo "Screenshots saved to docs/screenshots/"
ls -lh ../../docs/screenshots/ 2>/dev/null || echo "No screenshots found"

# Cleanup
if [ ! -z "$ANVIL_PID" ]; then
  echo "Stopping Anvil (PID: $ANVIL_PID)..."
  kill $ANVIL_PID 2>/dev/null || true
fi
