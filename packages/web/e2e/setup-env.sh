#!/bin/bash
set -e

echo "Starting Anvil..."
anvil --port 8545 &
ANVIL_PID=$!

# Wait for Anvil to start
sleep 2

echo "Deploying contracts..."
cd /workspace/contracts
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 > deploy.log 2>&1

# Extract deployed addresses
MOCK_USDC_ADDRESS=$(grep "MockUSDC deployed at:" deploy.log | awk '{print $4}')
VAULT_ADDRESS=$(grep "SimpleVault deployed at:" deploy.log | awk '{print $4}')

echo "MockUSDC: $MOCK_USDC_ADDRESS"
echo "Vault: $VAULT_ADDRESS"

# Write addresses to env file for web app
cat > /workspace/packages/web/.env.e2e <<EOF
VITE_MOCK_USDC_ADDRESS=$MOCK_USDC_ADDRESS
VITE_VAULT_ADDRESS=$VAULT_ADDRESS
VITE_ENABLE_MOCK_CONNECTOR=true
EOF

echo "Environment ready!"
echo "ANVIL_PID=$ANVIL_PID"
