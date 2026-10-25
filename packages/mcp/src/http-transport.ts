import { createServer as createHttpServer } from 'http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Config } from './config.js';

export async function runHttpServer(server: Server, config: Config): Promise<void> {
  const httpServer = createHttpServer(async (req, res) => {
    if (!config.httpAuthToken) {
      console.error('[HTTP] WARNING: No auth token configured - server is open!');
    }

    if (config.httpAuthToken) {
      const authHeader = req.headers.authorization;
      const expectedToken = `Bearer ${config.httpAuthToken}`;

      if (authHeader !== expectedToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    const origin = req.headers.origin;
    const allowedOrigins = ['http://localhost', 'http://127.0.0.1'];
    const isAllowedOrigin = origin && allowedOrigins.some((allowed) => origin.startsWith(allowed));

    if (origin && !isAllowedOrigin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid origin' }));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin || 'http://localhost',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/sse') {
      const transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin || 'http://localhost',
      });

      return;
    }

    if (req.url === '/messages' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const message = JSON.parse(body);
          const transport = new SSEServerTransport('/messages', res);
          await transport.handlePostMessage(message, res);
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(config.httpPort, config.httpHost, () => {
    console.error(`[HTTP] MCP server listening on http://${config.httpHost}:${config.httpPort}`);
    console.error(`[HTTP] Health check: http://${config.httpHost}:${config.httpPort}/health`);
    console.error(`[HTTP] SSE endpoint: http://${config.httpHost}:${config.httpPort}/sse`);
    console.error(`[HTTP] Auth: ${config.httpAuthToken ? 'enabled' : 'DISABLED (WARNING)'}`);
  });
}
