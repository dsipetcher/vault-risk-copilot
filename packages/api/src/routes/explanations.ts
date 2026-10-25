import type { FastifyInstance } from 'fastify';
import { createProvider, getDefaultModel, isInvalidKeyError } from '@vault-risk-copilot/llm';
import { llmProviderConfigSchema } from '../types/schemas.js';
import {
  generateExplanation,
  getCachedExplanation,
} from '../services/explanations.js';
import { getAuthenticatedUser } from './auth.js';
import { getStoredCredential } from './llm-credentials.js';
import { isHttpError, statusForLlmConfigError } from '../lib/errors.js';

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
                model: { type: 'string', maxLength: 100 },
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

      let apiKey = (request.headers['x-llm-api-key'] as string) || undefined;

      const user = await getAuthenticatedUser(request);
      
      let providerConfig = undefined;
      
      // No provider/key/session: leave providerConfig unset so generateExplanation
      // uses the mock provider. The API does not read LLM_API_KEY or LLM_PROVIDER
      // from the environment (BYOK via header or stored wallet credentials only).
      const provider = body.provider || 'openai';
      
      if (user && !apiKey) {
        try {
          const storedKey = await getStoredCredential(user.address, provider, body.baseUrl);
          if (storedKey) {
            apiKey = storedKey;
            request.log.info(
              { wallet: user.address, provider },
              'Using stored credential for authenticated user'
            );
          }
        } catch (error) {
          if ((error as Error).message === 'baseurl_mismatch') {
            return reply.code(400).send({
              error: 'baseurl_mismatch',
              message: 'Stored credential cannot be used with the requested baseUrl',
            });
          }
          if ((error as Error).message === 'credential_unavailable') {
            return reply.code(422).send({
              error: 'credential_unavailable',
              message: 'Stored credential could not be decrypted. Please re-save your API key.',
            });
          }
          throw error;
        }
      }
      
      if (body.provider || apiKey) {
        try {
          providerConfig = llmProviderConfigSchema.parse({
            provider,
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
        const message = error instanceof Error ? error.message : String(error);
        if (isHttpError(error)) {
          return reply.code(error.statusCode).send({
            error: message,
            message,
          });
        }
        const configStatus = statusForLlmConfigError(error);
        if (configStatus) {
          return reply.code(configStatus).send({
            error: message,
            message,
          });
        }
        app.log.error({ error: message, poolId: id }, 'Failed to generate explanation');
        return reply.code(500).send({
          error: 'Failed to generate explanation',
          message,
        });
      }
    }
  );

  app.post<{
    Body?: { provider?: string; model?: string; baseUrl?: string };
  }>(
    '/llm/validate',
    {
      schema: {
        body: {
          anyOf: [
            {
              type: 'object',
              properties: {
                provider: {
                  type: 'string',
                  enum: ['openai', 'openrouter', 'groq', 'ollama', 'mock'],
                },
                model: { type: 'string', maxLength: 100 },
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
              ok: { type: 'boolean' },
              provider: { type: 'string' },
              model: { type: 'string' },
            },
            required: ['ok', 'provider', 'model'],
          },
          401: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              error: { type: 'string' },
              message: { type: 'string' },
              provider: { type: 'string' },
              model: { type: 'string' },
            },
            required: ['ok', 'error', 'message'],
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body || {};
      const provider = (body.provider || 'mock') as
        | 'openai'
        | 'openrouter'
        | 'groq'
        | 'ollama'
        | 'mock';
      const model = body.model?.trim() || getDefaultModel(provider);
      const apiKey = (request.headers['x-llm-api-key'] as string) || undefined;

      try {
        llmProviderConfigSchema.parse({
          provider,
          model,
          baseUrl: body.baseUrl,
        });
        const instance = createProvider({
          provider,
          apiKey,
          model,
          baseUrl: body.baseUrl,
        });
        await instance.validateConnection();
        return reply.send({ ok: true, provider, model });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isInvalidKeyError(error) || statusForLlmConfigError(error) === 401) {
          return reply.code(401).send({
            ok: false,
            error: 'invalid_key',
            message: message || 'Invalid API key',
            provider,
            model,
          });
        }
        const configStatus = statusForLlmConfigError(error) ?? 502;
        return reply.code(configStatus).send({
          ok: false,
          error: configStatus === 400 ? 'invalid_config' : 'provider_error',
          message,
          provider,
          model,
        });
      }
    }
  );
}
