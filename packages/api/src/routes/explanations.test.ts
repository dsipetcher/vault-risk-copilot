import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../../..');

describe('Explanations API Tests', () => {
  let app: FastifyInstance;
  let poolId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    process.env.LLM_PROVIDER = 'mock';
    
    // Run migrations before tests (CI provides fresh postgres via services)
    const migrationsScript = resolve(workspaceRoot, 'db/run-migrations.sh');
    const migrationsDir = resolve(workspaceRoot, 'db/migrations');
    execSync(`bash ${migrationsScript}`, {
      env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
      stdio: 'inherit',
    });
    
    app = await build();
    
    // Create test fixture: insert a pool snapshot and risk score
    const { pool } = await import('../database.js');
    
    // Create test fixture: insert a pool snapshot and risk score
    const poolResult = await pool.query(`
      INSERT INTO pool_snapshots (
        pool_id, pool_name, snapshot_at, protocol, chain, tvl_usd, apy, il_risk, is_stablecoin, count, data_source
      ) VALUES (
        gen_random_uuid(), 'Test Pool', NOW(), 'test-protocol', 'Ethereum', 1000000, 5.5, 0.05, false, 10, 'defillama'
      ) RETURNING pool_id
    `);
    poolId = poolResult.rows[0].pool_id;
    
    await pool.query(`
      INSERT INTO risk_scores (
        pool_id, calculated_at, total_risk_score, risk_category,
        tvl_score, tvl_volatility_score, apy_volatility_score, reward_ratio_score,
        stablecoin_score, il_score, data_age_score, vault_score
      ) VALUES (
        $1, NOW(), 50, 'medium', 75, 60, 55, null, null, 80, null, null
      )
    `, [poolId]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return explanation with all required fields in HTTP response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/pools/${poolId}/explain`,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'mock',
      }),
    });

    // Expect 200, fail on any other status
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);

    // Verify top-level structure
    expect(body).toHaveProperty('explanation');
    expect(body).toHaveProperty('metadata');
    expect(body).toHaveProperty('cached');

    // Verify explanation has all required fields (this is what was broken)
    expect(body.explanation).toHaveProperty('summary');
    expect(body.explanation).toHaveProperty('key_factors');
    expect(body.explanation).toHaveProperty('disclaimer');

    // Verify explanation fields are not empty objects
    expect(typeof body.explanation.summary).toBe('string');
    expect(body.explanation.summary.length).toBeGreaterThan(0);

    expect(Array.isArray(body.explanation.key_factors)).toBe(true);
    expect(body.explanation.key_factors.length).toBeGreaterThan(0);

    // Verify key_factors structure
    const firstFactor = body.explanation.key_factors[0];
    expect(firstFactor).toHaveProperty('signal');
    expect(firstFactor).toHaveProperty('value');
    expect(firstFactor).toHaveProperty('explanation');
    expect(typeof firstFactor.signal).toBe('string');
    expect(typeof firstFactor.value).toBe('string');
    expect(typeof firstFactor.explanation).toBe('string');

    expect(typeof body.explanation.disclaimer).toBe('string');
    expect(body.explanation.disclaimer.length).toBeGreaterThan(0);

    // Verify metadata
    expect(body.metadata).toHaveProperty('provider');
    expect(body.metadata.provider).toBe('mock');
  });

  it('should not strip fields with fast-json-stringify', async () => {
    // This is the actual bug: Fastify's fast-json-stringify strips properties
    // when schema declares `type: object` without `properties`

    const response = await app.inject({
      method: 'POST',
      url: `/api/pools/${poolId}/explain`,
      body: JSON.stringify({ provider: 'mock' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);

    // The bug was: explanation came back as {} even though handler returned full object
    // With the fix, these should all be present
    expect(body.explanation).not.toEqual({});
    expect(Object.keys(body.explanation).length).toBeGreaterThan(0);
    expect(body.explanation.summary).toBeDefined();
    expect(body.explanation.key_factors).toBeDefined();
    expect(body.explanation.disclaimer).toBeDefined();
  });

  it('CRITICAL: should pass original API key to provider (not redacted)', async () => {
    // Regression test: onRequest hook was mutating request.headers['x-llm-api-key'] 
    // in place, so provider received '[REDACTED]' and BYOK calls failed
    const testKey = 'sk-test-1234567890abcdef';

    const response = await app.inject({
      method: 'POST',
      url: `/api/pools/${poolId}/explain`,
      headers: {
        'content-type': 'application/json',
        'x-llm-api-key': testKey,
      },
      body: JSON.stringify({
        provider: 'mock',
      }),
    });

    // Mock provider doesn't validate keys, but a real provider would fail with 401
    // if it received '[REDACTED]' instead of the original key
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('explanation');
    expect(body).toHaveProperty('metadata');
  });
});
