import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import type { Logger } from 'pino';
import type { VaultStateSnapshot } from './db.js';

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
  {
    inputs: [],
    name: 'depositCap',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class VaultReader {
  private client: PublicClient;

  constructor(
    rpcUrl: string,
    private vaultAddress: Address,
    private logger: Logger
  ) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
  }

  async readVaultState(): Promise<VaultStateSnapshot> {
    this.logger.info({ vaultAddress: this.vaultAddress }, 'Reading vault state');

    try {
      const [totalAssets, totalSupply, depositCap, isPaused, owner, block] = await Promise.all([
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'totalAssets',
        }),
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'totalSupply',
        }),
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'depositCap',
        }),
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'paused',
        }),
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'owner',
        }),
        this.client.getBlock(),
      ]);

      const sharePrice =
        totalSupply > 0n ? Number(totalAssets) / Number(totalSupply) : undefined;

      const utilizationPct =
        depositCap > 0n ? (Number(totalAssets) / Number(depositCap)) * 100 : undefined;

      const snapshot: VaultStateSnapshot = {
        vault_address: this.vaultAddress,
        chain: 'Sepolia',
        total_assets: totalAssets,
        total_supply: totalSupply,
        share_price: sharePrice,
        deposit_cap: depositCap,
        is_paused: isPaused,
        owner_address: owner,
        utilization_pct: utilizationPct,
        block_number: block.number,
        block_timestamp: new Date(Number(block.timestamp) * 1000),
        snapshot_at: new Date(),
      };

      this.logger.info(
        {
          totalAssets: totalAssets.toString(),
          totalSupply: totalSupply.toString(),
          sharePrice,
          blockNumber: block.number.toString(),
        },
        'Vault state read successfully'
      );

      return snapshot;
    } catch (error) {
      this.logger.error({ error }, 'Failed to read vault state');
      throw error;
    }
  }
}
