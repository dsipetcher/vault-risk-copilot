import { describe, it, expect } from 'vitest';
import { isVaultConfigured, ZERO_ADDRESS } from '../vault-config';

describe('isVaultConfigured', () => {
  it('is false when addresses are missing or zero', () => {
    expect(isVaultConfigured('', '')).toBe(false);
    expect(isVaultConfigured(undefined, undefined)).toBe(false);
    expect(isVaultConfigured(ZERO_ADDRESS, ZERO_ADDRESS)).toBe(false);
    expect(isVaultConfigured('0xabc', '')).toBe(false);
    expect(isVaultConfigured('', '0xabc')).toBe(false);
  });

  it('is true only when both non-zero addresses are set', () => {
    expect(
      isVaultConfigured(
        '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
        '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
      )
    ).toBe(true);
  });
});
