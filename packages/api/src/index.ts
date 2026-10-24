import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import apiReference from '@scalar/fastify-api-reference';
import { env } from './config.js';
import { pool } from './database.js';
import { healthRoutes } from './routes/health.js';
import { poolsRoutes } from './routes/pools.js';
import { vaultRoutes } from './routes/vault.js';
import { riskRoutes } from './routes/risk.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Security middleware
await app.register(helmet, {
  contentSecurityPolicy: false, // Disable for API
});

await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true,
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
});

// OpenAPI documentation
await app.register(apiReference, {
  routePrefix: '/docs',
  configuration: {
    spec: {
      content: {
        openapi: '3.1.0',
        info: {
          title: 'Vault Risk Copilot API',
          version: '1.0.0',
          description: 'Node.js API for Vault Risk Copilot - aggregates pool data, risk scores, and vault state',
        },
        servers: [
          {
            url: `http://${env.HOST}:${env.PORT}`,
            description: 'Development server',
          },
        ],
      },
    },
  },
});

// Register routes
await app.register(healthRoutes, { prefix: '/api' });
await app.register(poolsRoutes, { prefix: '/api' });
await app.register(vaultRoutes, { prefix: '/api' });
await app.register(riskRoutes, { prefix: '/api' });

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, closing server...`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
});

// Start server
async function start() {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API server listening on ${env.HOST}:${env.PORT}`);
    app.log.info(`API docs available at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
