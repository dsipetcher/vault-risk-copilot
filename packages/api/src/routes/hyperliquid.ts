import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HyperliquidError } from '../lib/hyperliquid-client.js';
import {
  COIN_PATTERN,
  getHyperliquidFundingHistory,
  getHyperliquidMarket,
  listHyperliquidMarkets,
  type HyperliquidSort,
} from '../services/hyperliquid.js';

const coinParamSchema = z.object({
  coin: z
    .string()
    .trim()
    .regex(COIN_PATTERN, 'Coin must be 1-32 characters: letters, numbers, colon, underscore, or hyphen'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(32).optional(),
  sort: z.enum(['coin', 'funding', 'oi', 'volume', 'risk', 'deviation']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  include_delisted: z.coerce.boolean().optional(),
});

const fundingQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function hyperliquidRoutes(app: FastifyInstance) {
  app.get(
    '/hyperliquid/markets',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 500, default: 200 },
            offset: { type: 'number', minimum: 0, default: 0 },
            search: { type: 'string', maxLength: 32 },
            sort: {
              type: 'string',
              enum: ['coin', 'funding', 'oi', 'volume', 'risk', 'deviation'],
            },
            order: { type: 'string', enum: ['asc', 'desc'] },
            include_delisted: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const result = await listHyperliquidMarkets({
        limit: query.limit,
        offset: query.offset,
        search: query.search,
        sort: query.sort as HyperliquidSort | undefined,
        order: query.order,
        include_delisted: query.include_delisted,
      });
      return reply.send(result);
    }
  );

  app.get<{ Params: { coin: string } }>(
    '/hyperliquid/markets/:coin/funding',
    {
      schema: {
        params: {
          type: 'object',
          properties: { coin: { type: 'string' } },
          required: ['coin'],
        },
        querystring: {
          type: 'object',
          properties: {
            hours: { type: 'number', minimum: 1, maximum: 168, default: 24 },
          },
        },
      },
    },
    async (request, reply) => {
      const params = coinParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid coin',
          message: 'Coin must be 1-32 characters: letters, numbers, colon, underscore, or hyphen.',
        });
      }
      const { coin } = params.data;
      const { hours } = fundingQuerySchema.parse(request.query);
      try {
        const result = await getHyperliquidFundingHistory(coin, hours);
        return reply.send(result);
      } catch (error) {
        if (error instanceof HyperliquidError && error.status === 429) {
          return reply.code(429).send({
            error: 'Hyperliquid rate limited',
            message: 'Hyperliquid public Info API rate limited. Retry shortly.',
          });
        }
        if (error instanceof HyperliquidError) {
          request.log.warn({ status: error.status }, 'Hyperliquid funding history failed');
          return reply.code(502).send({
            error: 'Hyperliquid unavailable',
            message: 'Could not fetch funding history from Hyperliquid.',
          });
        }
        throw error;
      }
    }
  );

  app.get<{ Params: { coin: string } }>(
    '/hyperliquid/markets/:coin',
    {
      schema: {
        params: {
          type: 'object',
          properties: { coin: { type: 'string' } },
          required: ['coin'],
        },
      },
    },
    async (request, reply) => {
      const params = coinParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid coin',
          message: 'Coin must be 1-32 characters: letters, numbers, colon, underscore, or hyphen.',
        });
      }
      const { coin } = params.data;
      const market = await getHyperliquidMarket(coin);
      if (!market) {
        return reply.code(404).send({
          error: 'Market not found',
          message: `No Hyperliquid perp snapshot for ${coin}. Collector may not have run yet.`,
        });
      }
      return reply.send({ data: market, source: 'snapshot' });
    }
  );
}
