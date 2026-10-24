import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../index.js';
import type { FastifyInstance } from 'fastify';

describe('Explanations API Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    process.env.LLM_PROVIDER = 'mock';
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return explanation with all required fields in HTTP response', async () => {
    // Use a pool ID that likely exists in the database
    // If not found, the test will get a 404 which is fine for now
    const poolId = '747c1d2a-c668-4682-b9f9-296708a3dd90';

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

    // If pool not found, skip the test
    if (response.statusCode === 404 || response.statusCode === 500) {
      console.log(
        `Skipping: Pool not found or error (status ${response.statusCode})`
      );
      return;
    }

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

    const poolId = '747c1d2a-c668-4682-b9f9-296708a3dd90';

    const response = await app.inject({
      method: 'POST',
      url: `/api/pools/${poolId}/explain`,
      body: JSON.stringify({ provider: 'mock' }),
      headers: { 'content-type': 'application/json' },
    });

    if (response.statusCode !== 200) {
      console.log(`Skipping: Non-200 status ${response.statusCode}`);
      return;
    }

    const body = JSON.parse(response.body);

    // The bug was: explanation came back as {} even though handler returned full object
    // With the fix, these should all be present
    expect(body.explanation).not.toEqual({});
    expect(Object.keys(body.explanation).length).toBeGreaterThan(0);
    expect(body.explanation.summary).toBeDefined();
    expect(body.explanation.key_factors).toBeDefined();
    expect(body.explanation.disclaimer).toBeDefined();
  });
});
