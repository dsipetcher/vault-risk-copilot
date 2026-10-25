import { SiweMessage } from 'siwe';
import type { Pool } from 'pg';
import { randomBytes } from 'crypto';

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SiweVerifyOptions {
  domain: string;
  expectedChainId?: number;
}

export async function generateNonce(pool: Pool, requestIp?: string): Promise<string> {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  
  await pool.query(
    `INSERT INTO nonces (nonce, expires_at, requested_by_ip) 
     VALUES ($1, $2, $3)`,
    [nonce, expiresAt, requestIp]
  );
  
  return nonce;
}

export async function verifyAndConsumeSiweMessage(
  pool: Pool,
  message: string,
  signature: string,
  options: SiweVerifyOptions
): Promise<{ address: string; chainId: number }> {
  const siweMessage = new SiweMessage(message);
  
  if (siweMessage.domain !== options.domain) {
    throw new Error(`Domain mismatch: expected ${options.domain}, got ${siweMessage.domain}`);
  }
  
  if (options.expectedChainId && siweMessage.chainId !== options.expectedChainId) {
    throw new Error(`Chain ID mismatch: expected ${options.expectedChainId}, got ${siweMessage.chainId}`);
  }
  
  const now = new Date();
  
  if (siweMessage.expirationTime && new Date(siweMessage.expirationTime) < now) {
    throw new Error('SIWE message has expired');
  }
  
  if (siweMessage.notBefore && new Date(siweMessage.notBefore) > now) {
    throw new Error('SIWE message not yet valid');
  }
  
  const nonceResult = await pool.query(
    `SELECT nonce, used, expires_at FROM nonces 
     WHERE nonce = $1 FOR UPDATE`,
    [siweMessage.nonce]
  );
  
  if (nonceResult.rows.length === 0) {
    throw new Error('Invalid nonce: not found');
  }
  
  const nonceRow = nonceResult.rows[0];
  
  if (nonceRow.used) {
    throw new Error('Nonce already used (replay attack detected)');
  }
  
  if (new Date(nonceRow.expires_at) < now) {
    throw new Error('Nonce has expired');
  }
  
  await siweMessage.verify({ signature });
  
  await pool.query(
    `UPDATE nonces SET used = true, used_at = NOW() WHERE nonce = $1`,
    [siweMessage.nonce]
  );
  
  return {
    address: siweMessage.address,
    chainId: siweMessage.chainId,
  };
}

export async function createSession(
  pool: Pool,
  walletAddress: string,
  chainId: number,
  issuedAt: Date
): Promise<string> {
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  
  await pool.query(
    `INSERT INTO sessions (wallet_address, session_token, expires_at, chain_id, issued_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [walletAddress.toLowerCase(), sessionToken, expiresAt, chainId, issuedAt]
  );
  
  return sessionToken;
}

export async function getSessionByToken(
  pool: Pool,
  sessionToken: string
): Promise<{ walletAddress: string; chainId: number } | null> {
  const result = await pool.query(
    `SELECT wallet_address, chain_id, expires_at 
     FROM sessions 
     WHERE session_token = $1`,
    [sessionToken]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const session = result.rows[0];
  
  if (new Date(session.expires_at) < new Date()) {
    await pool.query(
      `DELETE FROM sessions WHERE session_token = $1`,
      [sessionToken]
    );
    return null;
  }
  
  await pool.query(
    `UPDATE sessions SET last_used_at = NOW() WHERE session_token = $1`,
    [sessionToken]
  );
  
  return {
    walletAddress: session.wallet_address,
    chainId: session.chain_id,
  };
}

export async function deleteSession(pool: Pool, sessionToken: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE session_token = $1`, [sessionToken]);
}

export async function cleanupExpiredNonces(pool: Pool): Promise<number> {
  const result = await pool.query(`DELETE FROM nonces WHERE expires_at < NOW()`);
  return result.rowCount || 0;
}

export async function cleanupExpiredSessions(pool: Pool): Promise<number> {
  const result = await pool.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
  return result.rowCount || 0;
}
