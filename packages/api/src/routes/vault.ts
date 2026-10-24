import type { FastifyInstance } from 'fastify';
import { getVaultState } from '../lib/viem.js';

export async function vaultRoutes(fastify: FastifyInstance) {
  fastify.get('/api/vault/state', async (_request, reply) => {
    try {
      const state = await getVaultState();
      return state;
    } catch (error: any) {
      fastify.log.error(error);
      reply.code(500);
      return { error: 'Failed to fetch vault state', message: error.message };
    }
  });
}
