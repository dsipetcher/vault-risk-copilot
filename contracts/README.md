# Smart Contracts

ERC-4626 vault implementation with security best practices for the Vault Risk Copilot project.

## Contracts

### MockUSDC
A simple ERC-20 token mimicking USDC with 6 decimals. Anyone can mint tokens for testing on Sepolia.

**Features:**
- 6 decimals (matching USDC)
- Public `mint()` function for testing
- `burn()` function

### SimpleVault (ERC-4626)
A tokenized vault implementing the ERC-4626 standard with security features.

**Features:**
- ✅ Full ERC-4626 compliance (deposit/withdraw/mint/redeem)
- ✅ Protection against inflation/donation attacks (OZ 5.x virtual shares)
- ✅ Pausable functionality
- ✅ Deposit cap
- ✅ Owner-controlled yield simulation (`harvest()`)
- ✅ SafeERC20 for all token operations
- ✅ Reentrancy guards
- ✅ Two-step ownership transfer
- ✅ Emergency token recovery

**Security:**
- Checks-Effects-Interactions pattern
- Access control via `Ownable2Step`
- `nonReentrant` on all state-changing functions
- Correct rounding direction (favors vault on deposits, favors users on withdrawals)
- Virtual shares mechanism prevents first-depositor attacks

## Testing

### Run all tests
```bash
forge test
```

### Run with gas report
```bash
forge test --gas-report
```

### Run specific test file
```bash
forge test --match-path test/SimpleVault.t.sol
```

### Run with verbosity
```bash
forge test -vvv
```

### Test Coverage
- **Unit tests:** Basic functionality, access control, edge cases
- **Fuzz tests:** Randomized deposit/withdraw amounts and scenarios
- **Invariant tests:** Property-based testing with random operation sequences

**Key Invariants Tested:**
1. Total assets >= sum of redeemable assets (solvency)
2. Vault's token balance >= totalAssets
3. Total supply matches sum of user shares
4. No user loses deposited assets (accounting for withdrawals)
5. Harvest only increases or maintains total assets

## Deployment

### Prerequisites
1. Set up your `.env` file (copy from `../.env.example`)
2. Fund your deployer wallet with Sepolia ETH (get from faucet)
3. Get an Etherscan API key for verification

### Deploy to Sepolia

```bash
# Load environment variables
source .env

# Deploy
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

### Verify Contracts (if auto-verify failed)

```bash
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> \
  --chain sepolia \
  --constructor-args $(cast abi-encode "constructor(...)" <ARGS>)
```

Example:
```bash
# Verify MockUSDC
forge verify-contract $MOCK_USDC_ADDRESS src/MockUSDC.sol:MockUSDC --chain sepolia

# Verify SimpleVault
forge verify-contract $VAULT_ADDRESS src/SimpleVault.sol:SimpleVault \
  --chain sepolia \
  --constructor-args $(cast abi-encode "constructor(address,string,string,uint256,address)" $MOCK_USDC_ADDRESS "Simple Vault USDC" "svUSDC" 10000000000000 $OWNER_ADDRESS)
```

## Static Analysis

### Run Slither

```bash
# Install slither if not already installed
pip install slither-analyzer

# Run analysis
slither .
```

## Deployment Addresses

These contracts are **not deployed publicly**. Use local Anvil (see the root README [Local ERC-4626 vault](../README.md#local-erc-4626-vault-anvil) section) or `packages/web/e2e/run-e2e.sh`.

## Interacting with Contracts

### Using cast (Foundry CLI)

```bash
# Read vault info
cast call $VAULT_ADDRESS "totalAssets()" --rpc-url $SEPOLIA_RPC_URL
cast call $VAULT_ADDRESS "totalSupply()" --rpc-url $SEPOLIA_RPC_URL

# Mint test USDC
cast send $MOCK_USDC_ADDRESS "mint(address,uint256)" $YOUR_ADDRESS 1000000000 \
  --rpc-url $SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY

# Approve vault
cast send $MOCK_USDC_ADDRESS "approve(address,uint256)" $VAULT_ADDRESS 1000000000 \
  --rpc-url $SEPOLIA_RPC_URL --private-key $YOUR_PRIVATE_KEY

# Deposit
cast send $VAULT_ADDRESS "deposit(uint256,address)" 1000000000 $YOUR_ADDRESS \
  --rpc-url $SEPOLIA_RPC_URL --private-key $YOUR_PRIVATE_KEY
```

## Architecture Notes

### ERC-4626 Share Accounting

The vault uses OpenZeppelin's ERC-4626 implementation with a 3-decimal offset for virtual shares.

**Why virtual shares?**
- Protects against inflation attacks where an attacker deposits 1 wei, donates large amount, then next depositor gets 0 shares
- OZ 5.x adds virtual shares and assets to make the first deposit more expensive
- See: https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack

**Decimal calculation:**
- USDC: 6 decimals
- Vault shares: 6 + 3 (offset) = 9 decimals
- 1 vault share unit = 1e9
- Share price = totalAssets / totalSupply

### Rounding

ERC-4626 requires specific rounding to prevent economic exploits:
- `deposit/mint`: Round down shares (vault favorable)
- `withdraw/redeem`: Round up shares needed (user favorable)

This ensures:
1. Vault never loses assets due to rounding
2. Users can always withdraw at least what they deposited
3. No free value extraction via rounding manipulation

## Security Considerations

### Covered
- ✅ Reentrancy
- ✅ Access control
- ✅ Integer overflow/underflow (Solidity 0.8+)
- ✅ ERC-4626 rounding attacks
- ✅ Inflation/donation attacks
- ✅ Pausable in emergency
- ✅ Deposit caps
- ✅ SafeERC20 (handles non-standard tokens)

### Known Limitations (Testnet Project)
- ⚠️ Not audited
- ⚠️ Simplified yield mechanism (real vaults use DeFi strategies)
- ⚠️ No formal verification
- ⚠️ No emergency governance/multisig
- ⚠️ Basic access control (single owner)

### For Production Use
These would be needed:
- Professional audit
- Formal verification of critical functions
- Multi-sig or governance for admin functions
- Gradual rollout with TVL caps
- Insurance/coverage
- Emergency pause monitoring
- Strategy risk management

## License

MIT
