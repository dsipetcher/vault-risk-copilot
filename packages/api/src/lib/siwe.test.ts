import { describe, it, expect, vi } from 'vitest';
import { SiweMessage } from 'siwe';
import { Wallet } from 'ethers';
import type { Pool } from 'pg';
import { parseCommaSeparatedList, verifyAndConsumeSiweMessage } from './siwe.js';

function mockPool(rowCount = 1): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rowCount }),
  } as unknown as Pool;
}

async function signedMessage(overrides: Partial<ConstructorParameters<typeof SiweMessage>[0]> = {}) {
  const wallet = Wallet.createRandom();
  const siweMessage = new SiweMessage({
    domain: 'localhost',
    address: wallet.address,
    statement: 'Sign in to Vault Risk Copilot',
    uri: 'http://localhost:5173',
    version: '1',
    chainId: 1,
    nonce: 'a'.repeat(16),
    issuedAt: new Date().toISOString(),
    ...overrides,
  });
  const message = siweMessage.prepareMessage();
  const signature = await wallet.signMessage(message);
  return { wallet, message, signature };
}

describe('parseCommaSeparatedList', () => {
  it('returns an empty list for missing or blank values', () => {
    expect(parseCommaSeparatedList(undefined)).toEqual([]);
    expect(parseCommaSeparatedList('')).toEqual([]);
    expect(parseCommaSeparatedList('  , , ')).toEqual([]);
  });

  it('parses a single value', () => {
    expect(parseCommaSeparatedList('localhost:5173')).toEqual(['localhost:5173']);
  });

  it('parses comma-separated SIWE domains and trims whitespace', () => {
    expect(parseCommaSeparatedList('localhost:5173, user.github.io')).toEqual([
      'localhost:5173',
      'user.github.io',
    ]);
  });
});

describe('verifyAndConsumeSiweMessage multi-value domain/URI', () => {
  it('accepts a domain from a comma-separated SIWE_DOMAIN list', async () => {
    const { wallet, message, signature } = await signedMessage({
      domain: 'user.github.io',
      uri: 'https://user.github.io/vault-risk-copilot/',
    });

    await expect(
      verifyAndConsumeSiweMessage(mockPool(), message, signature, {
        domain: 'localhost:5173,user.github.io',
        expectedUri: 'http://localhost:5173,https://user.github.io/vault-risk-copilot/',
        expectedChainIds: [1],
      })
    ).resolves.toEqual({ address: wallet.address, chainId: 1 });
  });

  it('rejects a domain that is not in the allowed list', async () => {
    const { message, signature } = await signedMessage({ domain: 'evil.com' });

    await expect(
      verifyAndConsumeSiweMessage(mockPool(), message, signature, {
        domain: 'localhost,user.github.io',
        expectedUri: 'http://localhost:5173',
      })
    ).rejects.toThrow(/Domain mismatch/);
  });

  it('rejects a URI that is not in the allowed list', async () => {
    const { message, signature } = await signedMessage({
      uri: 'https://evil.example/',
    });

    await expect(
      verifyAndConsumeSiweMessage(mockPool(), message, signature, {
        domain: 'localhost',
        expectedUri: 'http://localhost:5173,https://user.github.io/vault-risk-copilot/',
      })
    ).rejects.toThrow(/URI mismatch/);
  });
});
