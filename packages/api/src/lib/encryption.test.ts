import { describe, it, expect, beforeAll } from 'vitest';
import {
  initEncryption,
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  isEncryptionEnabled,
  requireEncryption,
} from './encryption.js';

describe('Encryption Library Tests', () => {
  const testMasterKey = Buffer.from('a'.repeat(32)).toString('base64');
  const testWallet = '0x1234567890123456789012345678901234567890';
  const testProvider = 'openai';
  const testApiKey = 'sk-test1234567890abcdefghijklmnopqrstuvwxyz';

  beforeAll(() => {
    initEncryption(testMasterKey);
  });

  describe('Initialization', () => {
    it('should initialize encryption with valid master key', () => {
      expect(isEncryptionEnabled()).toBe(true);
      expect(() => requireEncryption()).not.toThrow();
    });

    it('should reject master key with wrong length', () => {
      expect(() => {
        initEncryption(Buffer.from('short').toString('base64'));
      }).toThrow('Master key must be exactly 32 bytes');
    });

    it('should reject invalid base64', () => {
      expect(() => {
        initEncryption('not-valid-base64!!!');
      }).toThrow();
    });

    it('should disable encryption when no key provided', () => {
      initEncryption(undefined);
      expect(isEncryptionEnabled()).toBe(false);
      expect(() => requireEncryption()).toThrow('Encryption not initialized');
      
      initEncryption(testMasterKey);
    });
  });

  describe('Encryption/Decryption Round-Trip', () => {
    it('should encrypt and decrypt API key successfully', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.keyVersion).toBe(1);

      const decrypted = decryptApiKey(encrypted, testWallet, testProvider);
      expect(decrypted).toBe(testApiKey);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const encrypted1 = encryptApiKey(testApiKey, testWallet, testProvider);
      const encrypted2 = encryptApiKey(testApiKey, testWallet, testProvider);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      const decrypted1 = decryptApiKey(encrypted1, testWallet, testProvider);
      const decrypted2 = decryptApiKey(encrypted2, testWallet, testProvider);
      expect(decrypted1).toBe(testApiKey);
      expect(decrypted2).toBe(testApiKey);
    });

    it('should handle empty string', () => {
      const encrypted = encryptApiKey('', testWallet, testProvider);
      const decrypted = decryptApiKey(encrypted, testWallet, testProvider);
      expect(decrypted).toBe('');
    });

    it('should handle long API keys', () => {
      const longKey = 'sk-' + 'a'.repeat(500);
      const encrypted = encryptApiKey(longKey, testWallet, testProvider);
      const decrypted = decryptApiKey(encrypted, testWallet, testProvider);
      expect(decrypted).toBe(longKey);
    });
  });

  describe('AAD Binding (wallet + provider)', () => {
    it('should fail decryption with wrong wallet address', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      const wrongWallet = '0x9999999999999999999999999999999999999999';

      expect(() => {
        decryptApiKey(encrypted, wrongWallet, testProvider);
      }).toThrow('Decryption failed');
    });

    it('should fail decryption with wrong provider', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      const wrongProvider = 'anthropic';

      expect(() => {
        decryptApiKey(encrypted, testWallet, wrongProvider);
      }).toThrow('Decryption failed');
    });

    it('should be case-insensitive for wallet address', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet.toLowerCase(), testProvider);
      const decrypted = decryptApiKey(encrypted, testWallet.toUpperCase(), testProvider);
      expect(decrypted).toBe(testApiKey);
    });
  });

  describe('Tamper Detection', () => {
    it('should detect modified ciphertext', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] ^= 1;
      const tampered = {
        ...encrypted,
        ciphertext: tamperedCiphertext.toString('base64'),
      };

      expect(() => {
        decryptApiKey(tampered, testWallet, testProvider);
      }).toThrow('Decryption failed');
    });

    it('should detect modified IV', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      
      const tamperedIv = Buffer.from(encrypted.iv, 'base64');
      tamperedIv[0] ^= 1;
      const tampered = {
        ...encrypted,
        iv: tamperedIv.toString('base64'),
      };

      expect(() => {
        decryptApiKey(tampered, testWallet, testProvider);
      }).toThrow('Decryption failed');
    });

    it('should detect modified auth tag', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64');
      tamperedTag[0] ^= 1;
      const tampered = {
        ...encrypted,
        authTag: tamperedTag.toString('base64'),
      };

      expect(() => {
        decryptApiKey(tampered, testWallet, testProvider);
      }).toThrow('Decryption failed');
    });
  });

  describe('Key Version', () => {
    it('should reject mismatched key version', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      const wrongVersion = {
        ...encrypted,
        keyVersion: 99,
      };

      expect(() => {
        decryptApiKey(wrongVersion, testWallet, testProvider);
      }).toThrow('Key version mismatch');
    });
  });

  describe('Master Key Mismatch', () => {
    it('should fail decryption with different master key', () => {
      const encrypted = encryptApiKey(testApiKey, testWallet, testProvider);
      
      const differentKey = Buffer.from('b'.repeat(32)).toString('base64');
      initEncryption(differentKey);

      expect(() => {
        decryptApiKey(encrypted, testWallet, testProvider);
      }).toThrow('Decryption failed');

      initEncryption(testMasterKey);
    });
  });

  describe('maskApiKey', () => {
    it('should mask API key showing last 4 chars', () => {
      expect(maskApiKey('sk-1234567890abcdef')).toBe('****cdef');
      expect(maskApiKey('test123')).toBe('****123');
    });

    it('should mask short keys', () => {
      expect(maskApiKey('abc')).toBe('****');
      expect(maskApiKey('ab')).toBe('****');
      expect(maskApiKey('a')).toBe('****');
      expect(maskApiKey('')).toBe('****');
    });
  });
});
