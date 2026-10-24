import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  });
}
