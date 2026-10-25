import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from './index.js';

describe('OpenAPI docs', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves HTML at /docs', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.body).toMatch(/openapi\.json/i);
  });

  it('serves the OpenAPI document at /docs/openapi.json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths['/api/llm/validate']).toBeDefined();
    expect(body.paths['/api/vault/state']).toBeDefined();
  });
});
