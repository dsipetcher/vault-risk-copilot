import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { z } from 'zod';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface EncryptionConfig {
  masterKey: Buffer;
  keyVersion: number;
}

let encryptionConfig: EncryptionConfig | null = null;

export function initEncryption(masterKeyBase64: string | undefined): void {
  if (!masterKeyBase64) {
    encryptionConfig = null;
    return;
  }

  try {
    const masterKey = Buffer.from(masterKeyBase64, 'base64');
    if (masterKey.length !== KEY_LENGTH) {
      throw new Error(`Master key must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits)`);
    }
    
    encryptionConfig = {
      masterKey,
      keyVersion: 1,
    };
  } catch (error) {
    throw new Error(`Failed to initialize encryption: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isEncryptionEnabled(): boolean {
  return encryptionConfig !== null;
}

export function requireEncryption(): EncryptionConfig {
  if (!encryptionConfig) {
    throw new Error('Encryption not initialized. Set LLM_KEY_ENCRYPTION_KEY environment variable.');
  }
  return encryptionConfig;
}

export function encryptApiKey(
  apiKey: string,
  walletAddress: string,
  provider: string
): EncryptedData {
  const config = requireEncryption();
  
  const iv = randomBytes(IV_LENGTH);
  
  const aad = Buffer.from(`${walletAddress.toLowerCase()}:${provider}`);
  
  const cipher = createCipheriv(ALGORITHM, config.masterKey, iv);
  cipher.setAAD(aad);
  
  let ciphertext = cipher.update(apiKey, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: config.keyVersion,
  };
}

export function decryptApiKey(
  encrypted: EncryptedData,
  walletAddress: string,
  provider: string
): string {
  const config = requireEncryption();
  
  if (encrypted.keyVersion !== config.keyVersion) {
    throw new Error(`Key version mismatch: expected ${config.keyVersion}, got ${encrypted.keyVersion}`);
  }
  
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const aad = Buffer.from(`${walletAddress.toLowerCase()}:${provider}`);
  
  const decipher = createDecipheriv(ALGORITHM, config.masterKey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  
  try {
    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch (error) {
    throw new Error('Decryption failed: invalid ciphertext, auth tag, or AAD');
  }
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return '****';
  }
  return '****' + apiKey.slice(-4);
}

export const encryptedDataSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  keyVersion: z.number().int().positive(),
});
