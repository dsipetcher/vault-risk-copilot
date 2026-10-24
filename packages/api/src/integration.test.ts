import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from './database.js';
import { getLatestPools } from './services/pools.js';

let dbAvailable = false;

describe('Pools Integration Tests', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (error) {
      console.warn('Database not available, skipping integration tests');
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await pool.end();
    }
  });

  it('should fetch latest pools', async () => {
    if (!dbAvailable) {
      console.log('Skipping: DB not available');
      return;
    }

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
    if (!dbAvailable) {
      console.log('Skipping: DB not available');
      return;
    }

    const result = await getLatestPools(
      { protocol: 'nonexistent' },
      { limit: 10, offset: 0 }
    );

    expect(result.pools).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
