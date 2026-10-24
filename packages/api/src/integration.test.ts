import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from './database.js';
import { getLatestPools } from './services/pools.js';

describe('Pools Integration Tests', () => {
  beforeAll(async () => {
    // Database MUST be available for integration tests to run properly
    // CI should set up postgres via docker-compose or migrations
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    
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
