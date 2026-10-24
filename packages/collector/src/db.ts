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
  pool_address?: string;
  asset_symbol?: string;
  asset_address?: string;
  is_stablecoin: boolean;
  tvl_usd?: number;
  tvl_usd_7d_ago?: number;
  tvl_change_7d_pct?: number;
  apy?: number;
  apy_base?: number;
  apy_reward?: number;
  apy_7d?: number;
  apy_pct_7d?: number;
  apy_sigma?: number;
  il_risk?: number;
  count?: number;
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
    INSERT INTO vault_state_snapshots ${sql(snapshot)}
    ON CONFLICT (vault_address, block_number) DO NOTHING
  `;
}
