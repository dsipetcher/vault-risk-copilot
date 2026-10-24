import type { FastifyInstance } from 'fastify';
import { env } from '../config.js';
import { readVaultState } from '../services/vault.js';

export async function vaultRoutes(app: FastifyInstance) {
  // GET /vault/state - Get current on-chain vault state
  app.get(
    '/vault/state',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  vault_address: { type: 'string' },
                  total_assets: { type: 'string' },
                  total_supply: { type: 'string' },
                  share_price: { type: 'number' },
                  block_number: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      if (!env.VAULT_ADDRESS || !env.RPC_URL) {
        return reply.code(503).send({
          error: 'Vault monitoring not configured',
          message: 'VAULT_ADDRESS and RPC_URL must be set',
        });
      }

      try {
        const state = await readVaultState(env.VAULT_ADDRESS as `0x${string}`, env.RPC_URL);

        return reply.send({
          data: {
            vault_address: env.VAULT_ADDRESS,
            ...state,
          },
        });
      } catch (error) {
        app.log.error({ error }, 'Failed to read vault state');
        return reply.code(500).send({
          error: 'Failed to read vault state',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
