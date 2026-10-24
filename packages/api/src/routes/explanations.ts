import type { FastifyInstance } from 'fastify';
import { llmProviderConfigSchema } from '../types/schemas.js';
import {
  generateExplanation,
  getCachedExplanation,
} from '../services/explanations.js';

export async function explanationsRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body?: { provider?: string; model?: string; baseUrl?: string };
  }>(
    '/pools/:id/explain',
    {
      schema: {
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
            provider: {
              type: 'string',
              enum: ['openai', 'openrouter', 'groq', 'ollama', 'mock'],
            },
            model: { type: 'string' },
            baseUrl: { type: 'string', format: 'uri' },
          },
        },
        headers: {
          type: 'object',
          properties: {
            'x-llm-api-key': { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              explanation: { type: 'object' },
              metadata: { type: 'object' },
              cached: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body || {};

      const apiKey = (request.headers['x-llm-api-key'] as string) || undefined;

      let providerConfig = undefined;
      if (body.provider || apiKey) {
        try {
          providerConfig = llmProviderConfigSchema.parse({
            provider: body.provider || 'openai',
            model: body.model,
            baseUrl: body.baseUrl,
          });
        } catch (error) {
          return reply.code(400).send({
            error: 'Invalid provider configuration',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const cached = await getCachedExplanation(
        id,
        providerConfig?.provider,
        providerConfig?.model
      );
      if (cached) {
        return reply.send({
          explanation: cached.explanation,
          metadata: cached.metadata,
          cached: true,
        });
      }

      try {
        const result = await generateExplanation(id, providerConfig, apiKey);

        return reply.send({
          explanation: result.explanation,
          metadata: result.metadata,
          cached: false,
        });
      } catch (error) {
        app.log.error(
          {
            error: error instanceof Error ? error.message : String(error),
            poolId: id,
          },
          'Failed to generate explanation'
        );

        return reply.code(500).send({
          error: 'Failed to generate explanation',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
