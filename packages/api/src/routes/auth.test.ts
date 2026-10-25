import { createHash } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { SiweMessage } from 'siwe';
import { Wallet } from 'ethers';
import { pool } from '../database.js';

describe('SIWE Authentication Tests', () => {
  let app: FastifyInstance;
  let wallet: Wallet;
  let validNonce: string;
  let nonceCookie: string;

  async function nonceConsumed(n: string): Promise<boolean> {
    const r = await pool.query('SELECT used FROM nonces WHERE nonce = $1', [n]);
    return r.rows[0].used;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    process.env.LLM_KEY_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
    process.env.SIWE_DOMAIN = 'localhost';
    process.env.SIWE_URI = 'http://localhost:3000';
    process.env.SIWE_CHAIN_ID = '1';

    app = await build();
    wallet = Wallet.createRandom();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE wallet_address = $1', [
      wallet.address.toLowerCase(),
    ]);
    await pool.query('DELETE FROM nonces');
    await app.close();
  });

  beforeEach(async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/nonce',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    validNonce = body.nonce;
    const c = response.cookies.find((x) => x.name === 'siwe_nonce');
    expect(c?.value).toBe(validNonce);
    nonceCookie = `siwe_nonce=${c!.value}`;
  });

  describe('GET /auth/nonce', () => {
    it('should generate a valid nonce', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/nonce',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nonce).toBeDefined();
      expect(typeof body.nonce).toBe('string');
      expect(body.nonce.length).toBeGreaterThan(0);

      const nonceResult = await pool.query(
        'SELECT * FROM nonces WHERE nonce = $1',
        [body.nonce]
      );
      expect(nonceResult.rows.length).toBe(1);
      expect(nonceResult.rows[0].used).toBe(false);
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify valid SIWE message and create session', async () => {
      const nonceResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/nonce',
      });
      
      const cookies = nonceResponse.cookies;
      const nonceCookie = cookies.find((c) => c.name === 'siwe_nonce');
      expect(nonceCookie).toBeDefined();
      expect(nonceCookie?.httpOnly).toBe(true);
      
      const { nonce } = JSON.parse(nonceResponse.body);

      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: {
          'cookie': `siwe_nonce=${nonceCookie!.value}`,
        },
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.address).toBe(wallet.address);

      const sessionCookies = response.cookies;
      expect(sessionCookies.length).toBeGreaterThan(0);
      const sessionCookie = sessionCookies.find((c) => c.name === 'vault_session');
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);

      const nonceResult = await pool.query(
        'SELECT used FROM nonces WHERE nonce = $1',
        [nonce]
      );
      expect(nonceResult.rows[0].used).toBe(true);
    });

    it('should reject message with wrong domain', async () => {
      const siweMessage = new SiweMessage({
        domain: 'evil.com',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(body.message).toBeUndefined();
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject message with bad signature', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const badSignature = '0x' + 'a'.repeat(130);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature: badSignature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject expired message', async () => {
      const expiredDate = new Date(Date.now() - 10 * 60 * 1000);

      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        expirationTime: expiredDate.toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(body.message).toBeUndefined();
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject nonce reuse', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const firstResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });

      expect(secondResponse.statusCode).toBe(401);
      const body = JSON.parse(secondResponse.body);
      expect(body.error).toBe('Authentication failed');
    });

    it('should reject concurrent nonce reuse (parallel requests)', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const requests = Array(8).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/auth/verify',
          headers: { cookie: nonceCookie },
          payload: { message, signature },
        })
      );

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.statusCode === 200).length;
      const failCount = responses.filter(r => r.statusCode === 401).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(7);
      expect(await nonceConsumed(validNonce)).toBe(true);
    });

    it('should reject wrong URI', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'https://evil.example',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: { message, signature },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject wrong chainId', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 999,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: { message, signature },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject invalid origin on verify', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: {
          origin: 'https://evil.example',
          cookie: nonceCookie,
        },
        payload: { message, signature },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid origin');
      expect(await nonceConsumed(validNonce)).toBe(false);
    });

    it('should reject nonce cookie mismatch', async () => {
      const nonceResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/nonce',
      });
      
      const cookies = nonceResponse.cookies;
      const nonceCookie = cookies.find((c) => c.name === 'siwe_nonce');
      expect(nonceCookie).toBeDefined();

      const differentNonce = await (await app.inject({ method: 'GET', url: '/api/auth/nonce' })).json();

      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: differentNonce.nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: {
          'cookie': `siwe_nonce=${nonceCookie!.value}`,
        },
        payload: { message, signature },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(await nonceConsumed(differentNonce.nonce)).toBe(false);
    });
  });

  describe('GET /auth/me', () => {
    it('should return user info when authenticated', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const authResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });

      const cookies = authResponse.cookies;
      const sessionCookie = cookies.find((c) => c.name === 'vault_session');

      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          'cookie': `vault_session=${sessionCookie!.value}`,
        },
      });

      expect(meResponse.statusCode).toBe(200);
      const body = JSON.parse(meResponse.body);
      expect(body.authenticated).toBe(true);
      expect(body.address).toBe(wallet.address.toLowerCase());
      expect(body.chainId).toBe(1);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not authenticated');
    });
  });

  describe('POST /auth/logout', () => {
    it('should clear session and cookie', async () => {
      const siweMessage = new SiweMessage({
        domain: 'localhost',
        address: wallet.address,
        statement: 'Sign in',
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await wallet.signMessage(message);

      const authResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        headers: { cookie: nonceCookie },
        payload: {
          message,
          signature,
        },
      });

      const cookies = authResponse.cookies;
      const sessionCookie = cookies.find((c) => c.name === 'vault_session');

      const tokenHash = createHash('sha256').update(decodeURIComponent(sessionCookie!.value)).digest('hex');
      expect((await pool.query('SELECT 1 FROM sessions WHERE session_token = $1', [tokenHash])).rows.length).toBe(1);

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          'cookie': `vault_session=${sessionCookie!.value}`,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);
      const body = JSON.parse(logoutResponse.body);
      expect(body.success).toBe(true);

      const sessionResult = await pool.query(
        'SELECT * FROM sessions WHERE session_token = $1',
        [createHash('sha256').update(decodeURIComponent(sessionCookie!.value)).digest('hex')]
      );
      expect(sessionResult.rows.length).toBe(0);

      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          'cookie': `vault_session=${sessionCookie!.value}`,
        },
      });
      expect(meResponse.statusCode).toBe(401);
    });
  });
});
