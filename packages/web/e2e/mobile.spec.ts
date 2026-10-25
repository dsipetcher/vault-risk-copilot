import { test, expect } from '@playwright/test';

test.describe('Mobile viewport 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('header and pools table stay usable', async ({ page }) => {
    await page.goto('/pools');
    await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 15000 });

    const header = page.locator('nav');
    const headerBox = await header.boundingBox();
    expect(headerBox).toBeTruthy();
    expect(headerBox!.width).toBeLessThanOrEqual(390);

    await expect(page.getByTestId('llm-settings-button')).toBeVisible();
    await expect(page.getByText('Testnet')).toBeVisible();

    const table = page.locator('table').first();
    if (await table.count()) {
      const overflow = await page.locator('.overflow-x-auto').first().evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          overflowX: style.overflowX,
          clientWidth: (el as HTMLElement).clientWidth,
          scrollWidth: (el as HTMLElement).scrollWidth,
        };
      });
      expect(['auto', 'scroll']).toContain(overflow.overflowX);
      expect(overflow.clientWidth).toBeLessThanOrEqual(390);
    }
  });
});
