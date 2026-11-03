import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import {
  invalidQueryMessage,
  paginationQuerySchema,
  poolFiltersSchema,
  poolHistoryQuerySchema,
} from '../types/schemas.js';
import { getLatestPools, getPoolById, getPoolHistory } from '../services/pools.js';

function sendInvalidQuery(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: 'Invalid query',
    message: invalidQueryMessage(error),
  });
}

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
            order: { type: 'string', enum: ['asc', 'desc'] },
            search: { type: 'string', maxLength: 200 },
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
      const pagination = paginationQuerySchema.safeParse(request.query);
      if (!pagination.success) {
        return sendInvalidQuery(reply, pagination.error);
      }
      const filters = poolFiltersSchema.safeParse(request.query);
      if (!filters.success) {
        return sendInvalidQuery(reply, filters.error);
      }

      const { pools, total } = await getLatestPools(filters.data, pagination.data);

      return reply.send({
        data: pools,
        pagination: {
          total,
          limit: pagination.data.limit,
          offset: pagination.data.offset,
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
      const query = poolHistoryQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendInvalidQuery(reply, query.error);
      }

      const history = await getPoolHistory(id, query.data.limit);

      return reply.send({
        data: history,
        count: history.length,
      });
    }
  );
}
