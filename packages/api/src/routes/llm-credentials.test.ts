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

describe('LLM Credentials Tests', () => {
  let app: FastifyInstance;
  let wallet1: Wallet;
  let wallet2: Wallet;
  let sessionCookie1: string;
  let sessionCookie2: string;

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
    wallet1 = Wallet.createRandom();
    wallet2 = Wallet.createRandom();

    sessionCookie1 = await createSession(wallet1);
    sessionCookie2 = await createSession(wallet2);
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM llm_credentials WHERE wallet_address IN ($1, $2)',
      [wallet1.address.toLowerCase(), wallet2.address.toLowerCase()]
    );
    await pool.query(
      'DELETE FROM sessions WHERE wallet_address IN ($1, $2)',
      [wallet1.address.toLowerCase(), wallet2.address.toLowerCase()]
    );
    await pool.query('DELETE FROM nonces');
    await app.close();
  });

  async function createSession(wallet: Wallet): Promise<string> {
    const nonceResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/nonce',
    });
    const { nonce } = JSON.parse(nonceResponse.body);

    const siweMessage = new SiweMessage({
      domain: 'localhost',
      address: wallet.address,
      statement: 'Sign in',
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const message = siweMessage.prepareMessage();
    const signature = await wallet.signMessage(message);

    const authResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });

    const cookies = authResponse.cookies;
    const sessionCookie = cookies.find((c) => c.name === 'vault_session');
    return sessionCookie!.value;
  }

  beforeEach(async () => {
    await pool.query(
      'DELETE FROM llm_credentials WHERE wallet_address IN ($1, $2)',
      [wallet1.address.toLowerCase(), wallet2.address.toLowerCase()]
    );
  });

  describe('PUT /llm-credentials', () => {
    it('should save encrypted API key for authenticated user', async () => {
      const testApiKey = 'sk-test1234567890';

      const response = await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: {
          vault_session: sessionCookie1,
        },
        payload: {
          provider: 'openai',
          apiKey: testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.provider).toBe('openai');

      const dbResult = await pool.query(
        'SELECT * FROM llm_credentials WHERE wallet_address = $1 AND provider = $2',
        [wallet1.address.toLowerCase(), 'openai']
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].ciphertext).toBeDefined();
      expect(dbResult.rows[0].iv).toBeDefined();
      expect(dbResult.rows[0].auth_tag).toBeDefined();
      expect(dbResult.rows[0].key_version).toBe(1);

      expect(dbResult.rows[0].ciphertext).not.toContain(testApiKey);
    });

    it('should update existing credential', async () => {
      const firstKey = 'sk-first-key';
      const secondKey = 'sk-second-key';

      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'openai', apiKey: firstKey },
      });

      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'openai', apiKey: secondKey },
      });

      expect(updateResponse.statusCode).toBe(200);

      const dbResult = await pool.query(
        'SELECT COUNT(*) FROM llm_credentials WHERE wallet_address = $1 AND provider = $2',
        [wallet1.address.toLowerCase(), 'openai']
      );
      expect(parseInt(dbResult.rows[0].count)).toBe(1);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        payload: {
          provider: 'openai',
          apiKey: 'sk-test',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication required');
    });

    it('should validate provider enum', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: {
          provider: 'invalid-provider',
          apiKey: 'sk-test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require non-empty API key', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: {
          provider: 'openai',
          apiKey: '',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /llm-credentials', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'openai', apiKey: 'sk-test-openai-key' },
      });

      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'anthropic', apiKey: 'sk-test-anthropic-key' },
      });
    });

    it('should return masked credentials for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.credentials).toHaveLength(2);

      const openaiCred = body.credentials.find((c: any) => c.provider === 'openai');
      expect(openaiCred).toBeDefined();
      expect(openaiCred.maskedKey).toContain('****');
      expect(openaiCred.maskedKey).not.toContain('sk-test-openai-key');
      expect(openaiCred.createdAt).toBeDefined();
      expect(openaiCred.updatedAt).toBeDefined();
    });

    it('should never return plaintext API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(200);
      const responseText = response.body;
      expect(responseText).not.toContain('sk-test-openai-key');
      expect(responseText).not.toContain('sk-test-anthropic-key');
    });

    it('should only return credentials for authenticated wallet', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie2 },
        payload: { provider: 'openai', apiKey: 'sk-wallet2-key' },
      });

      const response1 = await app.inject({
        method: 'GET',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie2 },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);

      expect(body1.credentials).toHaveLength(2);
      expect(body2.credentials).toHaveLength(1);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/llm-credentials',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /llm-credentials', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'openai', apiKey: 'sk-test-key' },
      });
    });

    it('should delete credential for authenticated user', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/llm-credentials?provider=openai',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      const dbResult = await pool.query(
        'SELECT * FROM llm_credentials WHERE wallet_address = $1 AND provider = $2',
        [wallet1.address.toLowerCase(), 'openai']
      );
      expect(dbResult.rows.length).toBe(0);
    });

    it('should not delete another wallet\'s credentials', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie2 },
        payload: { provider: 'openai', apiKey: 'sk-wallet2-key' },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/llm-credentials?provider=openai',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(200);

      const wallet2Creds = await pool.query(
        'SELECT * FROM llm_credentials WHERE wallet_address = $1 AND provider = $2',
        [wallet2.address.toLowerCase(), 'openai']
      );
      expect(wallet2Creds.rows.length).toBe(1);
    });

    it('should return 404 for non-existent credential', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/llm-credentials?provider=groq',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Credential not found');
    });

    it('should require provider query param', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Provider is required');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/llm-credentials?provider=openai',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Integration: Stored credential used in explain endpoint', () => {
    it('should use stored credential when authenticated and no header provided', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/llm-credentials',
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'mock', apiKey: 'stored-mock-key' },
      });

      const poolResult = await pool.query(`
        INSERT INTO pool_snapshots (
          pool_id, pool_name, snapshot_at, protocol, chain, tvl_usd, apy, il_risk, is_stablecoin, count, data_source
        ) VALUES (
          gen_random_uuid(), 'Test Pool for Stored Key', NOW(), 'test-protocol', 'Ethereum', 1000000, 5.5, 0.05, false, 10, 'defillama'
        ) RETURNING pool_id
      `);
      const poolId = poolResult.rows[0].pool_id;

      await pool.query(`
        INSERT INTO risk_scores (
          pool_id, calculated_at, total_risk_score, risk_category,
          tvl_score, tvl_volatility_score, apy_volatility_score
        ) VALUES (
          $1, NOW(), 50, 'medium', 75, 60, 55
        )
      `, [poolId]);

      const explainResponse = await app.inject({
        method: 'POST',
        url: `/api/pools/${poolId}/explain`,
        cookies: { vault_session: sessionCookie1 },
        payload: { provider: 'mock' },
      });

      expect(explainResponse.statusCode).toBe(200);
      const body = JSON.parse(explainResponse.body);
      expect(body.explanation).toBeDefined();
      expect(body.metadata.provider).toBe('mock');

      await pool.query('DELETE FROM explanations WHERE pool_id = $1', [poolId]);
      await pool.query('DELETE FROM risk_scores WHERE pool_id = $1', [poolId]);
      await pool.query('DELETE FROM pool_snapshots WHERE pool_id = $1', [poolId]);
    });
  });
});
