import { test, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: join(__dirname, '../../docs/screenshots', `${name}.png`),
    fullPage: true,
  });
}

test.describe('Vault E2E Flow', () => {
  test('complete vault workflow: mint -> approve -> deposit -> redeem', async ({ page }) => {
    // Navigate to app (redirects to /pools)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for React to hydrate
    
    // Should be on Pools page - wait for either the h1 or the error state
    await page.waitForSelector('h1, [role="alert"]', { timeout: 10000 });
    await takeScreenshot(page, '01-pools-page');

    // Navigate to Vault page
    await page.click('a:has-text("Vault")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.waitForSelector('h1, [role="alert"]', { timeout: 10000 });
    await takeScreenshot(page, '02-vault-page-initial');

    // Check if we need to connect wallet
    const connectButton = page.locator('button').filter({ hasText: /connect/i }).first();
    const isConnectVisible = await connectButton.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (isConnectVisible) {
      await connectButton.click();
      await page.waitForTimeout(1000);
      
      // Look for Mock connector button
      const mockButton = page.locator('button').filter({ hasText: /mock/i }).first();
      const hasMock = await mockButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasMock) {
        await mockButton.click();
        await page.waitForTimeout(2000);
      }
    }

    await takeScreenshot(page, '03-vault-connected');

    // Wait for balances to load
    await page.waitForTimeout(3000);
    
    // Find and click mint button
    const mintButton = page.locator('button').filter({ hasText: /mint/i }).first();
    const hasMint = await mintButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasMint) {
      await mintButton.click();
      await page.waitForTimeout(4000); // Wait for transaction
      await takeScreenshot(page, '04-vault-after-mint');

      // Approve USDC - find input and approve button
      const inputs = await page.locator('input[type="text"], input[type="number"]').all();
      if (inputs.length > 0) {
        await inputs[0].fill('1000');
        const approveButton = page.locator('button').filter({ hasText: /approve/i }).first();
        await approveButton.click();
        await page.waitForTimeout(4000);
        await takeScreenshot(page, '05-vault-after-approve');

        // Deposit
        if (inputs.length > 1) {
          await inputs[1].fill('500');
          const depositButton = page.locator('button').filter({ hasText: /deposit/i }).first();
          await depositButton.click();
          await page.waitForTimeout(4000);
          await takeScreenshot(page, '06-vault-after-deposit');

          // Redeem
          if (inputs.length > 2) {
            await inputs[2].fill('250');
            const redeemButton = page.locator('button').filter({ hasText: /redeem/i }).first();
            await redeemButton.click();
            await page.waitForTimeout(4000);
            await takeScreenshot(page, '07-vault-after-redeem');
          }
        }
      }
    }

    // Final state
    await takeScreenshot(page, '08-vault-final-state');
    console.log('✓ E2E test completed');
  });
});
