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
    await expect(page.getByTestId('testnet-badge')).toBeVisible();
    await page.getByTestId('mobile-nav-toggle').click();
    await expect(page.getByRole('link', { name: 'Hyperliquid' })).toBeVisible();

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

  test('selecting a Hyperliquid market keeps the risk heading in view', async ({ page }) => {
    await page.goto('/hyperliquid');
    await expect(page.getByTestId('hyperliquid-title')).toBeVisible({ timeout: 15000 });
    const rows = page.getByTestId('hyperliquid-row');
    await expect(rows.first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastRow = rows.last();
    await lastRow.scrollIntoViewIfNeeded();
    await lastRow.click();

    const heading = page.getByTestId('hyperliquid-detail-heading');
    await expect(heading).toBeVisible();
    await expect(heading).toBeInViewport();

    const placement = await heading.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const nav = document.querySelector('nav');
      const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
      return { top: rect.top, bottom: rect.bottom, navBottom, vh: window.innerHeight };
    });
    expect(placement.top).toBeGreaterThanOrEqual(placement.navBottom - 2);
    expect(placement.top).toBeLessThan(placement.navBottom + 48);
    expect(placement.bottom).toBeLessThanOrEqual(placement.vh);
    expect(placement.top).toBeGreaterThanOrEqual(0);
  });
});
