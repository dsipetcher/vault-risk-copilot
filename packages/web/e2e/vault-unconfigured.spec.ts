import { test, expect } from '@playwright/test';

test.describe('Vault page when contracts are not configured', () => {
  test('shows the public-demo placeholder and keeps the mobile layout usable', async ({
    page,
  }, testInfo) => {
    await page.goto('/vault');

    await expect(page.getByTestId('vault-unavailable')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('vault-title')).toHaveText('Vault');
    await expect(page.getByTestId('error-message')).toHaveCount(0);
    await expect(page.getByText(/VITE_VAULT_ADDRESS/)).toHaveCount(0);
    await expect(page.getByTestId('deposit-amount-input')).toHaveCount(0);
    await expect(page.getByTestId('redeem-amount-input')).toHaveCount(0);

    const vaultNav = page.getByRole('link', { name: 'Vault', exact: true });
    if (!(await vaultNav.first().isVisible().catch(() => false))) {
      await page.getByTestId('mobile-nav-toggle').click();
    }
    await expect(page.getByRole('link', { name: 'Vault', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('vault-local-readme-link')).toBeVisible();
    await expect(page.getByTestId('vault-contracts-link')).toBeVisible();

    const card = page.getByTestId('vault-unavailable-card');
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport?.width ?? 1280);

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowX).toBeLessThanOrEqual(1);
  });
});
