import type { FastifyInstance } from 'fastify';
import { pool } from '../database.js';
import { getAuthenticatedUser } from './auth.js';
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  isEncryptionEnabled,
  type EncryptedData,
} from '../lib/encryption.js';
import { z } from 'zod';
import { env } from '../config.js';

const putCredentialSchema = z.object({
  provider: z.enum(['openai', 'openrouter', 'groq', 'ollama', 'anthropic', 'mock']),
  apiKey: z.string().min(1),
});

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export async function llmCredentialsRoutes(app: FastifyInstance) {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  
  function checkOrigin(request: any, reply: any) {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      reply.code(403).send({ error: 'Forbidden: Invalid origin' });
      return false;
    }
    return true;
  }

  app.put<{
    Body: { provider: string; apiKey: string };
  }>(
    '/llm-credentials',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['openai', 'openrouter', 'groq', 'ollama', 'anthropic'],
            },
            apiKey: { type: 'string', minLength: 1 },
          },
          required: ['provider', 'apiKey'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              provider: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!checkOrigin(request, reply)) {
        return;
      }
      
      if (!isEncryptionEnabled()) {
        return reply.code(503).send({
          error: 'Server-side key storage is not available',
          message: 'Encryption is not configured on the server',
        });
      }

      const user = await getAuthenticatedUser(request);
      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required',
        });
      }

      try {
        const { provider, apiKey } = putCredentialSchema.parse(request.body);

        const encrypted = encryptApiKey(apiKey, user.address, provider);
        
        const keyHint = maskApiKey(apiKey);

        await pool.query(
          `INSERT INTO llm_credentials 
           (wallet_address, provider, ciphertext, iv, auth_tag, key_version, key_hint)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (wallet_address, provider) 
           DO UPDATE SET 
             ciphertext = EXCLUDED.ciphertext,
             iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag,
             key_version = EXCLUDED.key_version,
             key_hint = EXCLUDED.key_hint,
             updated_at = NOW()`,
          [
            user.address.toLowerCase(),
            provider,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.authTag,
            encrypted.keyVersion,
            keyHint,
          ]
        );

        app.log.info(
          { wallet: user.address, provider },
          'LLM credential saved'
        );

        return reply.send({
          success: true,
          provider,
        });
      } catch (error) {
        app.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to save LLM credential'
        );

        return reply.code(500).send({
          error: 'Failed to save credential',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get('/llm-credentials', async (request, reply) => {
    if (!isEncryptionEnabled()) {
      return reply.code(503).send({
        error: 'Server-side key storage is not available',
      });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return reply.code(401).send({
        error: 'Authentication required',
      });
    }

    const result = await pool.query(
      `SELECT provider, key_hint, created_at, updated_at
       FROM llm_credentials
       WHERE wallet_address = $1
       ORDER BY provider`,
      [user.address.toLowerCase()]
    );

    const credentials = result.rows.map((row) => ({
      provider: row.provider,
      maskedKey: row.key_hint || '****',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return reply.send({ credentials });
  });

  app.delete<{
    Querystring: { provider: string };
  }>('/llm-credentials', async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    
    if (!isEncryptionEnabled()) {
      return reply.code(503).send({
        error: 'Server-side key storage is not available',
      });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return reply.code(401).send({
        error: 'Authentication required',
      });
    }

    const provider = request.query.provider;
    if (!provider) {
      return reply.code(400).send({
        error: 'Provider is required',
      });
    }

    const result = await pool.query(
      `DELETE FROM llm_credentials 
       WHERE wallet_address = $1 AND provider = $2`,
      [user.address.toLowerCase(), provider]
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({
        error: 'Credential not found',
      });
    }

    app.log.info(
      { wallet: user.address, provider },
      'LLM credential deleted'
    );

    return reply.send({ success: true });
  });
}

export async function getStoredCredential(
  walletAddress: string,
  provider: string,
  requestedBaseUrl?: string
): Promise<string | null> {
  if (!isEncryptionEnabled()) {
    return null;
  }
  
  const defaultBaseUrl = PROVIDER_BASE_URLS[provider];
  if (requestedBaseUrl && defaultBaseUrl && requestedBaseUrl !== defaultBaseUrl) {
    throw new Error('baseurl_mismatch');
  }

  const result = await pool.query(
    `SELECT ciphertext, iv, auth_tag, key_version
     FROM llm_credentials
     WHERE wallet_address = $1 AND provider = $2`,
    [walletAddress.toLowerCase(), provider]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const encrypted: EncryptedData = {
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    keyVersion: row.key_version,
  };

  try {
    return decryptApiKey(encrypted, walletAddress, provider);
  } catch (error) {
    throw new Error('credential_unavailable');
  }
}
