import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from './database.js';
import { getLatestPools } from './services/pools.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../..');

describe('Pools Integration Tests', () => {
  beforeAll(async () => {
    // Database MUST be available for integration tests to run properly
    // CI should set up postgres via docker-compose or migrations
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    
    // Clean database before migrations (test environment only)
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('GRANT ALL ON SCHEMA public TO postgres');
    await pool.query('GRANT ALL ON SCHEMA public TO public');
    
    // Run migrations before tests
    const migrationsScript = resolve(workspaceRoot, 'db/run-migrations.sh');
    const migrationsDir = resolve(workspaceRoot, 'db/migrations');
    execSync(`bash ${migrationsScript}`, {
      env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
      stdio: 'inherit',
    });
    
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should fetch latest pools', async () => {
    const result = await getLatestPools(
      {},
      { limit: 10, offset: 0 }
    );

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
});
