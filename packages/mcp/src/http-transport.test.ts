import { afterEach, describe, expect, it } from 'vitest';
import type { Server as HttpServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { runHttpServer } from './http-transport.js';
import type { Config } from './config.js';

const baseConfig: Config = {
  apiBaseUrl: 'http://localhost:3000',
  httpPort: 18766,
  httpHost: '127.0.0.1',
  httpAuthToken: 'test-token-secret',
  requestTimeoutMs: 5000,
  explainTimeoutMs: 45000,
  logLevel: 'error',
};

function dummyServer(): Server {
  return new Server({ name: 'test', version: '0.0.0' }, { capabilities: {} });
}

describe('HTTP transport guards', () => {
  let listening: HttpServer | undefined;

  afterEach(async () => {
    if (!listening) return;
    const server = listening;
    listening = undefined;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('refuses to start without an auth token', async () => {
    await expect(
      runHttpServer(dummyServer, { ...baseConfig, httpAuthToken: undefined })
    ).rejects.toThrow(/HTTP_AUTH_TOKEN/);
  });

  it('refuses to bind a non-loopback host', async () => {
    await expect(
      runHttpServer(dummyServer, { ...baseConfig, httpHost: '0.0.0.0' })
    ).rejects.toThrow(/non-loopback/);
  });

  it('rejects invalid Origin and missing token, allows loopback health', async () => {
    listening = await runHttpServer(dummyServer, baseConfig);

    const health = await fetch(`http://127.0.0.1:${baseConfig.httpPort}/health`);
    expect(health.status).toBe(200);

    const noAuth = await fetch(`http://127.0.0.1:${baseConfig.httpPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(noAuth.status).toBe(401);

    const evilOrigin = await fetch(`http://127.0.0.1:${baseConfig.httpPort}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-secret',
        Origin: 'http://localhost.evil.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(evilOrigin.status).toBe(403);
  });
});
