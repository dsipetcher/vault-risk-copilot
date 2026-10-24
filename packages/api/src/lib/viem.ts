import { createPublicClient, http, parseAbi, type PublicClient, type Chain } from 'viem';
import { sepolia, foundry } from 'viem/chains';

const RPC_URL = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;
const VAULT_ADDRESS = (process.env.VAULT_ADDRESS || '') as `0x${string}`;

const chain: Chain = RPC_URL?.includes('sepolia') || RPC_URL?.includes('11155111') ? sepolia : foundry;

export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

const VAULT_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function paused() view returns (bool)',
]);

export async function getVaultState() {
  if (!VAULT_ADDRESS) {
    throw new Error('VAULT_ADDRESS not configured');
  }

  const [totalAssets, totalSupply, paused] = await Promise.all([
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'totalAssets',
    }),
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'totalSupply',
    }),
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'paused',
    }),
  ]);

  const sharePrice = totalSupply > 0n ? Number(totalAssets) / Number(totalSupply) : 1;

  return {
    address: VAULT_ADDRESS,
    total_assets: totalAssets.toString(),
    total_supply: totalSupply.toString(),
    share_price: sharePrice.toString(),
    paused,
    updated_at: new Date().toISOString(),
  };
}
