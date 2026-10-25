import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { SiweMessage } from 'siwe';
import { Wallet } from 'ethers';
import { pool } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../../..');

describe('SIWE Authentication Tests', () => {
  let app: FastifyInstance;
  let wallet: Wallet;
  let validNonce: string;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/vault_risk';
    process.env.LLM_KEY_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

    const migrationsScript = resolve(workspaceRoot, 'db/run-migrations.sh');
    const migrationsDir = resolve(workspaceRoot, 'db/migrations');
    execSync(`bash ${migrationsScript}`, {
      env: { ...process.env, MIGRATIONS_DIR: migrationsDir },
      stdio: 'inherit',
    });

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

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.address).toBe(wallet.address);

      const cookies = response.cookies;
      expect(cookies.length).toBeGreaterThan(0);
      const sessionCookie = cookies.find((c) => c.name === 'vault_session');
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);

      const nonceResult = await pool.query(
        'SELECT used FROM nonces WHERE nonce = $1',
        [validNonce]
      );
      expect(nonceResult.rows[0].used).toBe(true);
    });

    it('should reject message with wrong domain', async () => {
      const siweMessage = new SiweMessage({
        domain: 'evil.com',
        address: wallet.address,
        statement: 'Sign in to Vault Risk Copilot',
        uri: 'http://evil.com',
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
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(body.message).toContain('Domain mismatch');
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
        payload: {
          message,
          signature: badSignature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
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
        payload: {
          message,
          signature,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
      expect(body.message).toContain('expired');
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
        payload: {
          message,
          signature,
        },
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: {
          message,
          signature,
        },
      });

      expect(secondResponse.statusCode).toBe(401);
      const body = JSON.parse(secondResponse.body);
      expect(body.message).toContain('already used');
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
        cookies: {
          vault_session: sessionCookie!.value,
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
        payload: {
          message,
          signature,
        },
      });

      const cookies = authResponse.cookies;
      const sessionCookie = cookies.find((c) => c.name === 'vault_session');

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: {
          vault_session: sessionCookie!.value,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);
      const body = JSON.parse(logoutResponse.body);
      expect(body.success).toBe(true);

      const sessionResult = await pool.query(
        'SELECT * FROM sessions WHERE session_token = $1',
        [sessionCookie!.value]
      );
      expect(sessionResult.rows.length).toBe(0);

      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          vault_session: sessionCookie!.value,
        },
      });
      expect(meResponse.statusCode).toBe(401);
    });
  });
});
