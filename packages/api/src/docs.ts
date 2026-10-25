import type { FastifyInstance } from 'fastify';

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Vault Risk Copilot API',
    version: '1.0.0',
    description:
      'Node.js API for Vault Risk Copilot — pool data, risk scores, vault state, SIWE auth, and LLM explanations.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service status' } },
      },
    },
    '/api/pools': {
      get: {
        summary: 'List pools with risk scores',
        responses: { '200': { description: 'Paginated pool list' } },
      },
    },
    '/api/pools/{id}': {
      get: {
        summary: 'Get one pool',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Pool detail' }, '404': { description: 'Not found' } },
      },
    },
    '/api/pools/{id}/explain': {
      post: {
        summary: 'Generate a risk explanation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Explanation' } },
      },
    },
    '/api/llm/validate': {
      post: {
        summary: 'Validate an LLM API key with a live provider ping',
        responses: {
          '200': { description: 'Key accepted' },
          '401': { description: 'invalid_key' },
        },
      },
    },
    '/api/vault/state': {
      get: {
        summary: 'On-chain vault state',
        responses: {
          '200': { description: 'Vault state' },
          '503': { description: 'Vault not configured' },
        },
      },
    },
  },
};

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Vault Risk Copilot API</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; }
    code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 4px; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Vault Risk Copilot API</h1>
  <p>OpenAPI document: <a href="/docs/openapi.json"><code>/docs/openapi.json</code></a></p>
  <ul>
    <li><code>GET /api/health</code></li>
    <li><code>GET /api/pools</code></li>
    <li><code>GET /api/pools/:id</code></li>
    <li><code>POST /api/pools/:id/explain</code></li>
    <li><code>POST /api/llm/validate</code></li>
    <li><code>GET /api/vault/state</code></li>
  </ul>
</body>
</html>`;

export async function docsRoutes(app: FastifyInstance) {
  app.get('/docs/openapi.json', async (_request, reply) => {
    return reply.type('application/json').send(openApiSpec);
  });

  app.get('/docs', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(DOCS_HTML);
  });
}
