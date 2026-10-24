import { createPublicClient, http, type Address } from 'viem';

// Simple Vault ABI (only functions we need to read)
const VAULT_ABI = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface VaultState {
  total_assets: string;
  total_supply: string;
  share_price: number;
  block_number: number;
}

export async function readVaultState(vaultAddress: Address, rpcUrl: string): Promise<VaultState> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const [totalAssets, totalSupply, blockNumber] = await Promise.all([
    client.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'totalAssets',
    }),
    client.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'totalSupply',
    }),
    client.getBlockNumber(),
  ]);

  const sharePrice = totalSupply > 0n ? Number(totalAssets) / Number(totalSupply) : 0;

  return {
    total_assets: totalAssets.toString(),
    total_supply: totalSupply.toString(),
    share_price: sharePrice,
    block_number: Number(blockNumber),
  };
}
