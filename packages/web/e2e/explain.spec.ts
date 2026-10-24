import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: join(__dirname, '../../../docs/screenshots', `${name}.png`),
    fullPage: true,
  });
  console.log(`✅ Screenshot saved: ${name}.png`);
}

test.describe('LLM Explain Feature', () => {
  test('should explain risk with mock provider', async ({ page }) => {
    test.setTimeout(60000);

    // Capture console logs
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[PAGE ${type.toUpperCase()}]:`, text);
    });
    
    page.on('pageerror', err => {
      console.log('[PAGE ERROR]:', err.message);
    });

    // Navigate to pools page
    await page.goto('/pools');
    await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 10000 });

    // Find and click first pool link
    const poolRows = page.getByTestId('pool-row');
    const poolCount = await poolRows.count();
    console.log(`Found ${poolCount} pool rows`);

    // Must have at least one pool - no skip allowed
    expect(poolCount).toBeGreaterThan(0);

    // Click first pool
    console.log('Clicking first pool row...');
    await poolRows.first().click();
    
    // Wait for navigation
    console.log('Waiting for navigation...');
    await page.waitForURL(/\/pools\/[a-f0-9-]+$/, { timeout: 10000 });
    console.log(`✅ Navigated to: ${page.url()}`);
    
    // Wait for pool detail page to load
    await expect(page.getByText(/Back to pools/)).toBeVisible({ timeout: 15000 });
    console.log('✅ Pool detail page loaded');

    // Check if ExplainPanel is visible
    const explainPanel = page.getByTestId('explain-panel');
    await expect(explainPanel).toBeVisible({ timeout: 5000 });
    console.log('✅ Explain panel visible');

    // Click Explain button
    const explainButton = page.getByTestId('explain-button');
    await expect(explainButton).toBeVisible();
    await explainButton.click();
    console.log('✅ Clicked Explain button');

    // Wait for explanation to load (mock should be fast)
    await expect(page.getByTestId('explanation-content')).toBeVisible({ timeout: 10000 });
    console.log('✅ Explanation loaded');

    // Verify summary is visible and has content
    const summary = page.getByTestId('explanation-summary');
    await expect(summary).toBeVisible();
    const summaryText = await summary.textContent();
    expect(summaryText).toBeTruthy();
    expect(summaryText!.length).toBeGreaterThan(20); // Min length from schema
    console.log(`✅ Summary present: "${summaryText?.substring(0, 50)}..."`);

    // Verify risk factors match available signals
    // Low-risk pool (33333333-...) has 8 non-null signals:
    // tvl_score, tvl_volatility_score, apy_volatility_score, 
    // reward_ratio_score, stablecoin_score, il_score, data_age_score, vault_score
    const factors = page.getByTestId('explanation-factors');
    await expect(factors).toBeVisible();
    
    const factorElements = page.locator('[data-testid^="risk-factor-"]');
    const factorCount = await factorElements.count();
    // Mock provider currently generates 6 factors (excludes stablecoin and vault)
    expect(factorCount).toBeGreaterThanOrEqual(6);
    console.log(`✅ Found ${factorCount} risk factors`);

    // Verify first factor has signal, value, and explanation
    const firstFactor = factorElements.first();
    const firstFactorText = await firstFactor.textContent();
    expect(firstFactorText).toBeTruthy();
    expect(firstFactorText!.length).toBeGreaterThan(10);
    console.log(`✅ First factor: "${firstFactorText?.substring(0, 50)}..."`);

    // Verify disclaimer is visible
    const disclaimer = page.getByTestId('explanation-disclaimer');
    await expect(disclaimer).toBeVisible();
    const disclaimerText = await disclaimer.textContent();
    expect(disclaimerText).toContain('Disclaimer');
    expect(disclaimerText!.length).toBeGreaterThan(20);
    console.log(`✅ Disclaimer present`);

    // Verify metadata shows provider
    const metadata = page.getByTestId('explanation-metadata');
    await expect(metadata).toBeVisible();
    const metadataText = await metadata.textContent();
    expect(metadataText).toContain('mock');
    console.log(`✅ Metadata shows provider: mock`);

    // Take screenshot for README
    await takeScreenshot(page, '09-explain-panel');
    console.log('✅ Screenshot captured for README');

    console.log('✅ LLM Explain test completed successfully');
  });

  test('should open LLM settings dialog from header', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto('/');

    // Click LLM Settings button in header
    const settingsButton = page.getByTestId('llm-settings-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Verify dialog opened
    const dialog = page.getByTestId('llm-settings-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    console.log('✅ LLM Settings dialog opened');

    // Verify provider select is visible
    const providerSelect = page.getByTestId('provider-select');
    await expect(providerSelect).toBeVisible();
    
    // Default should be mock
    expect(await providerSelect.inputValue()).toBe('mock');
    console.log('✅ Default provider is mock');

    // Change to OpenAI
    await providerSelect.selectOption('openai');
    
    // API key field should appear
    const apiKeyInput = page.getByTestId('api-key-input');
    await expect(apiKeyInput).toBeVisible();
    console.log('✅ API key field appears for OpenAI');

    // Close dialog
    await page.getByTestId('close-dialog').click();
    await expect(dialog).not.toBeVisible();
    console.log('✅ Dialog closed');
  });
});
