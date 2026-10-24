import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from './database.js';
import { getLatestPools, getPoolById } from './services/pools.js';

describe('Pools Integration Tests', () => {
  beforeAll(async () => {
    // Check if database is available
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.warn('Database not available, skipping integration tests');
      return;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should fetch latest pools', { skip: process.env.CI === 'true' }, async () => {
    const result = await getLatestPools(
      {},
      { limit: 10, offset: 0 }
    );

    expect(result).toHaveProperty('pools');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.pools)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('should handle empty filters', { skip: process.env.CI === 'true' }, async () => {
    const result = await getLatestPools(
      { protocol: 'nonexistent' },
      { limit: 10, offset: 0 }
    );

    expect(result.pools).toHaveLength(0);
  });
});
