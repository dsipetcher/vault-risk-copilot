import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth } from '../database.js';
import { checkRiskServiceHealth } from '../services/risk.js';

export async function healthRoutes(app: FastifyInstance) {
  // GET /health - Simple health check
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              timestamp: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  risk_service: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const [dbHealthy, riskServiceHealthy] = await Promise.all([
        checkDatabaseHealth(),
        checkRiskServiceHealth(),
      ]);

      const status = dbHealthy && riskServiceHealthy ? 'healthy' : dbHealthy ? 'degraded' : 'unhealthy';

      const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

      return reply.code(statusCode).send({
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? 'up' : 'down',
          risk_service: riskServiceHealthy ? 'up' : 'down',
        },
      });
    }
  );
}
