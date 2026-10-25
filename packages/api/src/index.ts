import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import apiReference from '@scalar/fastify-api-reference';
import { env } from './config.js';
import { pool } from './database.js';
import { healthRoutes } from './routes/health.js';
import { poolsRoutes } from './routes/pools.js';
import { vaultRoutes } from './routes/vault.js';
import { riskRoutes } from './routes/risk.js';
import { explanationsRoutes } from './routes/explanations.js';
import { authRoutes } from './routes/auth.js';
import { llmCredentialsRoutes } from './routes/llm-credentials.js';
import { redactApiKey } from '@vault-risk-copilot/llm';
import { initEncryption, isEncryptionEnabled } from './lib/encryption.js';

export async function build() {
  initEncryption(env.LLM_KEY_ENCRYPTION_KEY);
  
  if (!isEncryptionEnabled()) {
    if (env.NODE_ENV === 'production') {
      throw new Error('LLM_KEY_ENCRYPTION_KEY is required in production');
    }
    console.warn('⚠️  LLM_KEY_ENCRYPTION_KEY not set - server-side key storage disabled');
  }

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
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            headers: {
              ...request.headers,
              'x-llm-api-key': request.headers['x-llm-api-key']
                ? redactApiKey(request.headers['x-llm-api-key'] as string)
                : undefined,
            },
            hostname: request.hostname,
            remoteAddress: request.ip,
            remotePort: request.socket?.remotePort,
          };
        },
      },
    },
    disableRequestLogging: false,
  });

  app.setErrorHandler((error, request, reply) => {
    const errorMessage = error.message.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
    request.log.error({ ...error, message: errorMessage }, 'Request error');
    reply.status(error.statusCode || 500).send({
      error: errorMessage,
    });
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  
  await app.register(cookie);

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

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

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(poolsRoutes, { prefix: '/api' });
  await app.register(vaultRoutes, { prefix: '/api' });
  await app.register(riskRoutes, { prefix: '/api' });
  await app.register(explanationsRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(llmCredentialsRoutes, { prefix: '/api' });

  return app;
}

const app = await build();


const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, closing server...`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
});

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
