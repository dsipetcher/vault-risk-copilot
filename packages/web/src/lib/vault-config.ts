export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const REPO_URL = 'https://github.com/dsipetcher/vault-risk-copilot';
export const LOCAL_VAULT_README_URL = `${REPO_URL}#local-erc-4626-vault-anvil`;
export const CONTRACTS_SOURCE_URL = `${REPO_URL}/tree/main/contracts`;

export function isVaultConfigured(
  vaultAddress: string | undefined = import.meta.env.VITE_VAULT_ADDRESS,
  usdcAddress: string | undefined = import.meta.env.VITE_USDC_ADDRESS
): boolean {
  const vault = (vaultAddress ?? '').trim();
  const usdc = (usdcAddress ?? '').trim();
  return Boolean(vault) && Boolean(usdc) && vault !== ZERO_ADDRESS && usdc !== ZERO_ADDRESS;
}
