import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../database.js';
import {
  generateNonce,
  verifyAndConsumeSiweMessage,
  createSession,
  getSessionByToken,
  deleteSession,
} from '../lib/siwe.js';
import { z } from 'zod';
import { env } from '../config.js';

const SESSION_COOKIE_NAME = 'vault_session';
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const siweMessageSchema = z.object({
  message: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
});

export async function authRoutes(app: FastifyInstance) {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  
  function checkOrigin(request: FastifyRequest, reply: any) {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      reply.code(403).send({ error: 'Forbidden: Invalid origin' });
      return false;
    }
    return true;
  }

  app.get('/auth/nonce', async (request, reply) => {
    const nonce = await generateNonce(pool, request.ip);
    
    return reply.send({ nonce });
  });

  app.post<{
    Body: { message: string; signature: string };
  }>(
    '/auth/verify',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            signature: { 
              type: 'string',
              pattern: '^0x[a-fA-F0-9]{130}$'
            },
          },
          required: ['message', 'signature'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              address: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!checkOrigin(request, reply)) {
        return;
      }
      
      try {
        const { message, signature } = siweMessageSchema.parse(request.body);
        
        const domain = env.SIWE_DOMAIN || request.hostname;
        const expectedUri = env.SIWE_URI;
        const expectedChainId = env.SIWE_CHAIN_ID;
        
        if (env.NODE_ENV === 'production') {
          if (!env.SIWE_DOMAIN || !env.SIWE_URI || !env.SIWE_CHAIN_ID) {
            throw new Error('SIWE configuration incomplete in production');
          }
        }
        
        const { address, chainId } = await verifyAndConsumeSiweMessage(
          pool,
          message,
          signature,
          { domain, expectedUri, expectedChainId }
        );
        
        const sessionToken = await createSession(
          pool,
          address,
          chainId,
          new Date()
        );
        
        reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: SESSION_COOKIE_MAX_AGE,
          path: '/',
        });
        
        return reply.send({
          success: true,
          address,
        });
      } catch (error) {
        app.log.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'SIWE verification failed'
        );
        
        return reply.code(401).send({
          error: 'Authentication failed',
        });
      }
    }
  );

  app.post('/auth/logout', async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    
    if (sessionToken) {
      await deleteSession(pool, sessionToken);
    }
    
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    
    return reply.send({ success: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    
    if (!sessionToken) {
      return reply.code(401).send({
        error: 'Not authenticated',
      });
    }
    
    const session = await getSessionByToken(pool, sessionToken);
    
    if (!session) {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return reply.code(401).send({
        error: 'Session expired or invalid',
      });
    }
    
    return reply.send({
      authenticated: true,
      address: session.walletAddress,
      chainId: session.chainId,
    });
  });
}

export async function getAuthenticatedUser(
  request: FastifyRequest
): Promise<{ address: string; chainId: number } | null> {
  const sessionToken = request.cookies[SESSION_COOKIE_NAME];
  
  if (!sessionToken) {
    return null;
  }
  
  const session = await getSessionByToken(pool, sessionToken);
  
  if (!session) {
    return null;
  }
  
  return {
    address: session.walletAddress,
    chainId: session.chainId,
  };
}
