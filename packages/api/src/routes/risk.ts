import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recomputeRisk } from '../services/risk.js';

const recomputeBodySchema = z.object({
  force: z.boolean().optional().default(false),
});

export async function riskRoutes(app: FastifyInstance) {
  // POST /risk/recompute/:id - Trigger risk recomputation
  app.post<{ Params: { id: string }; Body: { force?: boolean } }>(
    '/risk/recompute/:id',
    {
      schema: {
        tags: ['Risk'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            force: { type: 'boolean', default: false },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              pool_id: { type: 'string' },
              status: { type: 'string', enum: ['success', 'error'] },
              message: { type: 'string' },
              risk_score: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = recomputeBodySchema.parse(request.body);

      try {
        const result = await recomputeRisk(id, body.force);
        return reply.send(result);
      } catch (error) {
        app.log.error({ error, pool_id: id }, 'Risk recompute failed');
        return reply.code(500).send({
          pool_id: id,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
