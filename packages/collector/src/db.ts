import postgres from 'postgres';
import type { Logger } from 'pino';

export function createDbClient(databaseUrl: string, logger: Logger) {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: (notice) => {
      logger.debug({ notice }, 'PostgreSQL notice');
    },
  });

  logger.info('✅ Database client created');
  return sql;
}

export type Sql = ReturnType<typeof createDbClient>;

export interface PoolSnapshot {
  pool_id: string;
  protocol: string;
  chain: string;
  pool_name: string;
  pool_address: string | null;
  asset_symbol?: string;
  asset_address: string | null;
  is_stablecoin: boolean;
  tvl_usd: number | null;
  tvl_usd_7d_ago: number | null;
  tvl_change_7d_pct: number | null;
  apy: number | null;
  apy_base: number | null;
  apy_reward: number | null;
  apy_7d: number | null;
  apy_pct_7d: number | null;
  apy_sigma: number | null;
  il_risk: number | null;
  count: number | null;
  data_source: 'defillama' | 'onchain';
  snapshot_at: Date;
}

export interface VaultStateSnapshot {
  vault_address: string;
  chain: string;
  total_assets: bigint;
  total_supply: bigint;
  share_price?: number;
  deposit_cap?: bigint;
  is_paused: boolean;
  owner_address?: string;
  utilization_pct?: number;
  block_number: bigint;
  block_timestamp: Date;
  snapshot_at: Date;
}

export async function insertPoolSnapshot(
  sql: Sql,
  snapshot: PoolSnapshot
): Promise<void> {
  await sql`
    INSERT INTO pool_snapshots ${sql(snapshot)}
    ON CONFLICT (pool_id, snapshot_at) DO NOTHING
  `;
}

export async function insertVaultStateSnapshot(
  sql: Sql,
  snapshot: VaultStateSnapshot
): Promise<void> {
  await sql`
    INSERT INTO vault_state_snapshots ${sql({
      ...snapshot,
      total_assets: snapshot.total_assets.toString(),
      total_supply: snapshot.total_supply.toString(),
      deposit_cap: snapshot.deposit_cap?.toString(),
      block_number: snapshot.block_number.toString(),
    })}
    ON CONFLICT (vault_address, block_number) DO NOTHING
  `;
}
