import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from './database.js';
import { getLatestPools } from './services/pools.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../..');

const SORT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SORT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SORT_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('Pools Integration Tests', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';

    const migrationsScript = resolve(workspaceRoot, 'db/run-migrations.sh');
    const migrationsDir = resolve(workspaceRoot, 'db/migrations');
    execSync(`bash ${migrationsScript}`, {
      env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
      stdio: 'inherit',
    });

    await pool.query('SELECT 1');

    await pool.query(
      `INSERT INTO pool_snapshots (
         pool_id, protocol, chain, pool_name, asset_symbol, is_stablecoin,
         tvl_usd, apy, data_source, snapshot_at
       ) VALUES
         ($1, 'sort-a', 'Ethereum', 'A', 'USDC', true, 1000, 1.0, 'test', NOW()),
         ($2, 'sort-b', 'Ethereum', 'B', 'USDC', true, 3000, 9.0, 'test', NOW()),
         ($3, 'sort-c', 'Ethereum', 'C', 'USDC', true, 2000, 5.0, 'test', NOW())`,
      [SORT_A, SORT_B, SORT_C]
    );

    await pool.query(
      `INSERT INTO risk_scores (pool_id, snapshot_id, total_risk_score, risk_category, model_version)
       SELECT s.pool_id, s.id, v.score, v.cat, '1.0'
       FROM pool_snapshots s
       JOIN (VALUES
         ($1, 10::numeric, 'low'),
         ($2, 90::numeric, 'critical'),
         ($3, 40::numeric, 'medium')
       ) AS v(pid, score, cat) ON s.pool_id = v.pid
       WHERE s.pool_id IN ($1, $2, $3)`,
      [SORT_A, SORT_B, SORT_C]
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM pool_snapshots WHERE pool_id IN ($1, $2, $3)`,
      [SORT_A, SORT_B, SORT_C]
    );
    await pool.end();
  });

  it('should fetch latest pools', async () => {
    const result = await getLatestPools({}, { limit: 10, offset: 0 });
    expect(result).toHaveProperty('pools');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.pools)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('should handle empty filters', async () => {
    const result = await getLatestPools(
      { protocol: 'nonexistent' },
      { limit: 10, offset: 0 }
    );
    expect(result.pools).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should sort by TVL descending across the full result set', async () => {
    const result = await getLatestPools(
      { protocol: 'sort-b' },
      { limit: 10, offset: 0 }
    );
    // isolate via three protocols... better: filter isn't enough. Fetch all sort-test via min_tvl + protocol prefix
    const sorted = await getLatestPools({ sort: 'tvl', min_tvl: 1000 }, { limit: 100, offset: 0 });
    const ours = sorted.pools.filter((p) => [SORT_A, SORT_B, SORT_C].includes(p.pool_id));
    expect(ours.map((p) => p.pool_id)).toEqual([SORT_B, SORT_C, SORT_A]);
    expect(ours.map((p) => p.tvl_usd)).toEqual([3000, 2000, 1000]);
    expect(result.pools[0].protocol).toBe('sort-b');
  });

  it('should sort by risk score descending on the server', async () => {
    const sorted = await getLatestPools({ sort: 'risk' }, { limit: 100, offset: 0 });
    const ours = sorted.pools.filter((p) => [SORT_A, SORT_B, SORT_C].includes(p.pool_id));
    expect(ours.map((p) => p.pool_id)).toEqual([SORT_B, SORT_C, SORT_A]);
    expect(ours.map((p) => p.total_risk_score)).toEqual([90, 40, 10]);
  });

  it('should search by protocol or asset symbol', async () => {
    const result = await getLatestPools({ search: 'sort-b' }, { limit: 10, offset: 0 });
    expect(result.pools.some((p) => p.pool_id === SORT_B)).toBe(true);
    expect(result.pools.every((p) => p.protocol.includes('sort-b') || p.asset_symbol.includes('sort-b'))).toBe(true);
  });

  it('should sort by APY descending on the server', async () => {
    const sorted = await getLatestPools({ sort: 'apy' }, { limit: 100, offset: 0 });
    const ours = sorted.pools.filter((p) => [SORT_A, SORT_B, SORT_C].includes(p.pool_id));
    expect(ours.map((p) => p.pool_id)).toEqual([SORT_B, SORT_C, SORT_A]);
    expect(ours.map((p) => p.apy)).toEqual([9, 5, 1]);
  });
});
