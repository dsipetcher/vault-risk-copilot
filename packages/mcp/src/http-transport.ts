import { createServer as createHttpServer, type IncomingMessage } from 'http';
import { timingSafeEqual } from 'crypto';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MAX_BODY_BYTES = 1_000_000;

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Exact hostname check (rejects e.g. http://localhost.evil.com). */
function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** DNS-rebinding protection: Host header must be a loopback name. */
function isLoopbackHostHeader(host: string | undefined): boolean {
  return !!host && isLoopbackUrl(`http://${host}`);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Streamable HTTP transport (stateless: one Server + transport per request).
 * Requires HTTP_AUTH_TOKEN and a loopback bind.
 */
export async function runHttpServer(serverFactory: () => Server, config: Config): Promise<import('http').Server> {
  const token = config.httpAuthToken;
  if (!token) {
    throw new Error('HTTP_AUTH_TOKEN is required for --transport=http');
  }
  if (!LOOPBACK_HOSTS.has(config.httpHost)) {
    throw new Error(`Refusing to bind HTTP transport to non-loopback host "${config.httpHost}"`);
  }

  const json = (res: import('http').ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const httpServer = createHttpServer(async (req, res) => {
    if (!isLoopbackHostHeader(req.headers.host)) return json(res, 403, { error: 'Forbidden: invalid Host' });
    const origin = req.headers.origin;
    if (origin && !isLoopbackUrl(origin)) return json(res, 403, { error: 'Forbidden: invalid Origin' });

    const path = (req.url ?? '/').split('?')[0];
    if (path === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok' });

    if (!tokenMatches(req.headers.authorization, token)) return json(res, 401, { error: 'Unauthorized' });

    if (path !== '/mcp') return json(res, 404, { error: 'Not found' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed (stateless mode)' });

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (e) {
      return json(res, 400, { error: (e as Error).message });
    }

    const server = serverFactory();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'Internal error' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.httpPort, config.httpHost, () => {
      httpServer.off('error', reject);
      console.error(`[HTTP] MCP server listening on http://${config.httpHost}:${config.httpPort}/mcp (auth required)`);
      resolve();
    });
  });

  return httpServer;
}
