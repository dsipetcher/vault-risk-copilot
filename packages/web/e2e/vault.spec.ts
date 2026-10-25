import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createPublicClient, http, formatUnits } from 'viem';
import { foundry } from 'viem/chains';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAULT_ADDRESS = process.env.VITE_VAULT_ADDRESS as `0x${string}`;

const publicClient = createPublicClient({
  chain: foundry,
  transport: http('http://localhost:8545'),
});

const VAULT_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: join(__dirname, '../../../docs/screenshots', `${name}.png`),
    fullPage: true,
  });
  console.log(`✅ Screenshot saved: ${name}.png`);
}

test.describe('Vault E2E Flow', () => {
  test('complete vault workflow with on-chain verification', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for the whole test
    
    // Capture console logs and errors
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[PAGE ${type.toUpperCase()}]:`, text);
    });
    
    page.on('pageerror', err => {
      console.log('[PAGE ERROR]:', err.message);
    });
    
    // Navigate to Pools page
    await page.goto('/');
    await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, '01-pools-page');

    // Check if there are any pool rows (API might be offline)
    const poolRows = page.getByTestId('pool-row');
    const poolCount = await poolRows.count();
    console.log(`Found ${poolCount} pool rows`);
    
    if (poolCount > 0) {
      // Click first pool link to view detail
      await poolRows.first().getByTestId(/pool-link-/).click();
      await page.waitForLoadState('networkidle');
      await takeScreenshot(page, '02-pool-detail');
      
      // Go back to pools
      await page.goBack();
      await expect(page.getByTestId('pools-title')).toBeVisible();
    }

    // Navigate to Vault page
    await page.getByRole('link', { name: 'Vault', exact: true }).click();
    await expect(page.getByTestId('vault-title')).toBeVisible({ timeout: 10000 });
    
    // Mock connector should auto-connect
    await expect(page.getByTestId('connected-address')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, '03-vault-connected');

    // Wait for balance to load
    await page.waitForTimeout(2000);
    
    // Mint USDC
    await page.getByTestId('mint-amount-input').fill('1000');
    await page.getByTestId('mint-button').click();
    
    // Wait for mint success
    await expect(page.getByTestId('mint-success')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000); // Allow balance to update
    await takeScreenshot(page, '04-after-mint');

    // Verify USDC balance updated
    const usdcBalanceAfterMint = await page.getByTestId('usdc-balance').textContent();
    const usdcBalanceNum = parseFloat(usdcBalanceAfterMint || '0');
    console.log('USDC Balance after mint:', usdcBalanceAfterMint);
    expect(usdcBalanceNum).toBeGreaterThan(1000); // Should have initial + 1000 minted

    // Store initial balance for later comparison
    const initialUsdcBalance = usdcBalanceNum;

    // Try to approve and deposit
    // Deposit
    await page.getByTestId('deposit-amount-input').fill('500');
    
    // Check if approve button exists
    const approveButton = page.getByTestId('approve-button');
    const isApproveVisible = await approveButton.isVisible().catch(() => false);
    
    if (isApproveVisible) {
      console.log('Approving USDC...');
      await approveButton.click();
      await expect(page.getByTestId('approve-success')).toBeVisible({ timeout: 30000 });
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '05-after-approve');
    }

    // Deposit
    const depositButton = page.getByTestId('deposit-button');
    await expect(depositButton).toBeVisible();
    await expect(depositButton).toBeEnabled();
    await depositButton.click();
    
    await expect(page.getByTestId('deposit-success')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '06-after-deposit');

    // Get vault decimals for proper formatting
    const vaultDecimals = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'decimals',
    });
    console.log('Vault decimals:', vaultDecimals);

    // Verify shares balance
    const sharesText = await page.getByTestId('vault-shares').textContent();
    console.log('Vault Shares (UI):', sharesText);
    const sharesDisplayed = parseFloat(sharesText || '0');
    
    // Shares should be approximately 500 (deposited amount)
    expect(sharesDisplayed).toBeGreaterThan(400);
    expect(sharesDisplayed).toBeLessThan(600);

    // Verify on-chain balance
    const onChainShares = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    console.log('On-chain shares (raw):', onChainShares.toString());
    console.log('On-chain shares (formatted):', formatUnits(onChainShares, vaultDecimals));
    expect(onChainShares).toBeGreaterThan(0n);

    // Verify convertToAssets shows ~500 USDC
    const assetsValue = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [onChainShares],
    });
    const assetsInUsdc = parseFloat(formatUnits(assetsValue, 6));
    console.log('Assets value in USDC:', assetsInUsdc);
    expect(assetsInUsdc).toBeGreaterThan(490);
    expect(assetsInUsdc).toBeLessThan(510);

    // Redeem ALL shares
    await page.getByTestId('redeem-amount-input').fill(sharesDisplayed.toString());
    await page.getByTestId('redeem-button').click();
    
    await expect(page.getByTestId('redeem-success')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '07-after-redeem');

    // Verify shares are zero after full redeem
    const sharesAfterRedeem = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    console.log('Shares after redeem:', sharesAfterRedeem.toString());
    expect(sharesAfterRedeem).toBe(0n);

    // Verify USDC balance restored (should be approximately initial balance)
    const finalUsdcBalanceText = await page.getByTestId('usdc-balance').textContent();
    const finalUsdcBalance = parseFloat(finalUsdcBalanceText || '0');
    console.log('Final USDC balance:', finalUsdcBalance);
    console.log('Initial USDC balance:', initialUsdcBalance);
    
    // Allow small rounding difference
    const balanceDiff = Math.abs(finalUsdcBalance - initialUsdcBalance);
    expect(balanceDiff).toBeLessThan(1); // Less than 1 USDC difference

    console.log('✅ E2E test completed successfully');
    
    // Final state screenshot
    await takeScreenshot(page, '08-final-state');
  });
});
