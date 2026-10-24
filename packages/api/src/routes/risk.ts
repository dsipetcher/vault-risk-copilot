import type { FastifyInstance } from 'fastify';

const RISK_SERVICE_URL = process.env.RISK_SERVICE_URL || 'http://localhost:8000';

export async function riskRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/api/risk/recompute/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const response = await fetch(`${RISK_SERVICE_URL}/recompute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pool_ids: [id],
          force: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        reply.code(response.status);
        return { error: 'Risk service error', message: error };
      }

      const result = await response.json();
      return {
        success: true,
        message: `Recomputed risk for pool ${id}`,
        result,
      };
    } catch (error: any) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to recompute risk', message: error.message };
    }
  });
}
