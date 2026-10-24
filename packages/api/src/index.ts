import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { poolsRoutes } from './routes/pools.js';
import { vaultRoutes } from './routes/vault.js';
import { riskRoutes } from './routes/risk.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
});

await fastify.register(helmet, {
  contentSecurityPolicy: false,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(healthRoutes);
await fastify.register(poolsRoutes);
await fastify.register(vaultRoutes);
await fastify.register(riskRoutes);

fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
  });
});

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Server listening on ${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

process.on('SIGTERM', async () => {
  fastify.log.info('SIGTERM received, closing server...');
  await fastify.close();
  process.exit(0);
});
