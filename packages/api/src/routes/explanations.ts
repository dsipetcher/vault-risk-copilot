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
          anyOf: [
            {
              type: 'object',
              properties: {
                provider: {
                  type: 'string',
                  enum: ['openai', 'openrouter', 'groq', 'ollama', 'mock'],
                },
                model: { type: 'string' },
                baseUrl: { type: 'string', format: 'uri' },
              },
              additionalProperties: false,
            },
            { type: 'null' },
          ],
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
              explanation: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  key_factors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        signal: { type: 'string' },
                        value: { type: 'string' },
                        explanation: { type: 'string' },
                      },
                      required: ['signal', 'value', 'explanation'],
                    },
                  },
                  disclaimer: { type: 'string' },
                },
                required: ['summary', 'key_factors', 'disclaimer'],
              },
              metadata: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  model: { type: 'string' },
                  timestamp: { type: 'string' },
                  latency_ms: { type: 'number' },
                  prompt_tokens: { type: 'number' },
                  completion_tokens: { type: 'number' },
                  total_tokens: { type: 'number' },
                  fallback: { type: 'boolean' },
                  fallback_reason: { type: 'string' },
                },
              },
              cached: { type: 'boolean' },
            },
            required: ['explanation', 'metadata', 'cached'],
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
          metadata: {
            ...cached.metadata,
            timestamp: new Date().toISOString(),
            latency_ms: cached.metadata.latencyMs,
            prompt_tokens: cached.metadata.promptTokens,
            completion_tokens: cached.metadata.completionTokens,
            total_tokens: cached.metadata.totalTokens,
          },
          cached: true,
        });
      }

      try {
        const result = await generateExplanation(id, providerConfig, apiKey);

        return reply.send({
          explanation: result.explanation,
          metadata: {
            ...result.metadata,
            timestamp: new Date().toISOString(),
            latency_ms: result.metadata.latencyMs,
            prompt_tokens: result.metadata.promptTokens,
            completion_tokens: result.metadata.completionTokens,
            total_tokens: result.metadata.totalTokens,
          },
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
