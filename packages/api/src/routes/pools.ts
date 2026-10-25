import type { FastifyInstance } from 'fastify';
import { paginationQuerySchema, poolFiltersSchema } from '../types/schemas.js';
import { getLatestPools, getPoolById, getPoolHistory } from '../services/pools.js';

export async function poolsRoutes(app: FastifyInstance) {
  // GET /pools - List pools with filters and pagination
  app.get(
    '/pools',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
            protocol: { type: 'string' },
            chain: { type: 'string' },
            is_stablecoin: { type: 'boolean' },
            risk_category: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            min_tvl: { type: 'number' },
            max_tvl: { type: 'number' },
            sort: { type: 'string', enum: ['tvl', 'risk', 'apy'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const pagination = paginationQuerySchema.parse(request.query);
      const filters = poolFiltersSchema.parse(request.query);

      const { pools, total } = await getLatestPools(filters, pagination);

      return reply.send({
        data: pools,
        pagination: {
          total,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });
    }
  );

  // GET /pools/:id - Get single pool with detailed risk score
  app.get<{ Params: { id: string } }>(
    '/pools/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const pool = await getPoolById(id);

      if (!pool) {
        return reply.code(404).send({ error: 'Pool not found' });
      }

      return reply.send({ data: pool });
    }
  );

  // GET /pools/:id/history - Get historical snapshots for a pool
  app.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    '/pools/:id/history',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 30 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { limit = 30 } = request.query;

      const history = await getPoolHistory(id, limit);

      return reply.send({
        data: history,
        count: history.length,
      });
    }
  );
}
