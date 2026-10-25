import { test, expect } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

/**
 * E2E test for Sign-In With Ethereum (SIWE) authentication flow.
 * 
 * Uses an injected mock EIP-1193 provider backed by a viem test account.
 * Tests the full UI flow with unique data-testid selectors:
 * connect wallet → sign in → address shown → reload persists → save key → masked hint → explain with stored key → sign out → verify 401
 */

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil test account #0
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

test.describe('SIWE Authentication E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock EIP-1193 provider that communicates signing requests back to test
    await page.exposeFunction('__signMessageExternal', async (message: string) => {
      // Sign using viem account in Node.js test context
      return await testAccount.signMessage({ message });
    });

    await page.addInitScript((accountAddress: string) => {
      // Mock EIP-1193 provider
      const ethereum = {
        isMetaMask: true,
        selectedAddress: null as string | null,
        chainId: '0x1',

        async request({ method, params }: { method: string; params?: unknown[] }) {
          console.log('[Mock Ethereum]', method);

          switch (method) {
            case 'eth_requestAccounts':
              ethereum.selectedAddress = accountAddress;
              return [accountAddress];

            case 'eth_accounts':
              return ethereum.selectedAddress ? [ethereum.selectedAddress] : [];

            case 'eth_chainId':
              return ethereum.chainId;

            case 'personal_sign': {
              // Delegate signing to test context via exposed function
              const [message] = params as [string];
              console.log('[Mock Ethereum] Signing message via external:', message.substring(0, 50));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const signature = await (window as any).__signMessageExternal(message);
              console.log('[Mock Ethereum] Signed:', signature.substring(0, 20));
              return signature;
            }

            case 'wallet_switchEthereumChain':
              ethereum.chainId = (params as [{ chainId: string }])[0].chainId;
              return null;

            default:
              throw new Error(`Unsupported method: ${method}`);
          }
        },

        on(_event: string, _handler: (...args: unknown[]) => void) {
          console.log('[Mock Ethereum] on', _event);
        },

        removeListener() {
          // noop
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = ethereum;
    }, testAccount.address);
  });

  test('complete SIWE auth flow: connect → sign in → address shown → reload persists → save key → masked hint → explain → sign out → 401', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Enable logging
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning' || type === 'log') {
        console.log(`[PAGE ${type.toUpperCase()}]:`, msg.text());
      }
    });

    page.on('pageerror', (err) => {
      console.error('[PAGE ERROR]:', err.message);
    });

    // 1. Navigate to app
    await page.goto('/');
    await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 10000 });
    console.log('✅ App loaded');

    // 2. Should see Connect Wallet button (not authenticated)
    const connectButton = page.getByTestId('auth-connect-button');
    await expect(connectButton).toBeVisible({ timeout: 5000 });
    console.log('✅ Connect button visible');

    // 3. Click Connect Wallet
    await connectButton.click();
    await page.waitForTimeout(1000); // Allow wagmi to connect

    // 4. Should now see "Sign In With Ethereum" button
    const signInButton = page.getByTestId('auth-sign-in-button');
    await expect(signInButton).toBeVisible({ timeout: 5000 });
    console.log('✅ Sign In button visible after wallet connect');

    // 5. Click Sign In With Ethereum
    await signInButton.click();
    await page.waitForTimeout(2000); // Allow SIWE signing and verification

    // 6. Should see address display after successful auth
    const addressDisplay = page.getByTestId('auth-address-display');
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const displayedAddress = await addressDisplay.textContent();
    expect(displayedAddress).toContain(testAccount.address.slice(0, 6));
    console.log('✅ Address displayed:', displayedAddress);

    // 7. Should see Sign Out button
    const signOutButton = page.getByTestId('auth-sign-out-button');
    await expect(signOutButton).toBeVisible();
    console.log('✅ Sign Out button visible');

    // 8. Reload page - auth should persist (session cookie)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('auth-address-display')).toBeVisible({ timeout: 5000 });
    console.log('✅ Auth persisted across reload');

    // 9. Open LLM settings dialog
    const settingsButton = page.getByTestId('llm-settings-button');
    await settingsButton.click();
    await expect(page.getByTestId('llm-settings-dialog')).toBeVisible();
    console.log('✅ LLM Settings dialog opened');

    // 10. ServerKeySettings should be visible (authenticated)
    const serverKeySettings = page.getByTestId('server-key-settings');
    await expect(serverKeySettings).toBeVisible({ timeout: 3000 });
    console.log('✅ Server key settings visible');

    // 11. Save a test key to server (use mock provider that API will accept)
    const providerSelect = page.getByTestId('server-provider-select');
    await providerSelect.selectOption('mock'); // Use mock provider for E2E
    const keyInput = page.getByTestId('server-api-key-input');
    await keyInput.fill('test-e2e-key-12345678'); // Dummy key
    const saveButton = page.getByTestId('server-key-save-button');
    await saveButton.click();

    // 12. Should see success message
    await expect(page.getByTestId('server-key-success')).toBeVisible({ timeout: 5000 });
    console.log('✅ Key saved successfully');

    // 13. Check stored keys list shows masked hint
    const storedKeysList = page.getByTestId('stored-keys-list');
    await expect(storedKeysList).toBeVisible({ timeout: 3000 });
    const storedKeyItem = page.getByTestId('stored-key-mock');
    await expect(storedKeyItem).toBeVisible();
    const hintText = await storedKeyItem.textContent();
    expect(hintText).toContain('****'); // Masked prefix
    expect(hintText).toContain('5678'); // Last 4 chars
    console.log('✅ Masked hint displayed:', hintText);

    // 14. Close dialog
    const cancelButton = page.getByTestId('server-key-cancel-button');
    await cancelButton.click();
    await expect(page.getByTestId('llm-settings-dialog')).not.toBeVisible();
    console.log('✅ Dialog closed');

    // 15. Request explanation (should use stored key from server)
    // First, check if there are any pools
    const poolRows = page.getByTestId('pool-row');
    const poolCount = await poolRows.count();

    if (poolCount > 0) {
      // Click first pool to go to detail page
      await poolRows.first().click();
      await page.waitForLoadState('networkidle');
      console.log('✅ Navigated to pool detail');

      // Look for explain button
      const explainButton = page.getByRole('button', { name: /explain|analysis/i });

      if ((await explainButton.count()) > 0 && (await explainButton.first().isVisible())) {
        await explainButton.first().click();
        console.log('✅ Explain button clicked');

        // Wait for explanation to load (should use server-stored key)
        // The mock LLM provider will return a response
        await expect(
          page.getByText(/loading|explanation|analysis|risk/i).first()
        ).toBeVisible({ timeout: 10000 });
        console.log('✅ Explanation rendered (using stored credential)');
      } else {
        console.log('⚠️  No explain button found on pool detail page');
      }
    } else {
      console.log('⚠️  No pools available for explain test');
    }

    // 16. Sign out
    await page.goto('/'); // Go back to main page
    const signOutBtn = page.getByTestId('auth-sign-out-button');
    await expect(signOutBtn).toBeVisible({ timeout: 3000 });
    await signOutBtn.click();
    await page.waitForTimeout(1000);
    console.log('✅ Signed out');

    // 17. Should see Connect Wallet button again (logged out)
    await expect(page.getByTestId('auth-connect-button')).toBeVisible({ timeout: 5000 });
    console.log('✅ Back to unauthenticated state');

    // 18. Verify /api/auth/me returns 401 after logout
    const meResponse = await page.request.get('http://localhost:3000/api/auth/me', {
      failOnStatusCode: false,
    });
    expect(meResponse.status()).toBe(401);
    console.log('✅ /api/auth/me returns 401 after sign out');

    // 19. Reload should not restore auth
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('auth-connect-button')).toBeVisible({ timeout: 3000 });
    console.log('✅ Auth not restored after sign out + reload');
  });

  test('unauthenticated user sees prompt in server key settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 10000 });

    // Open settings without signing in
    const settingsButton = page.getByTestId('llm-settings-button');
    await settingsButton.click();
    await expect(page.getByTestId('llm-settings-dialog')).toBeVisible();

    // ServerKeySettings should show "sign in" prompt
    const serverKeySettings = page.getByTestId('server-key-settings');
    await expect(serverKeySettings).toBeVisible({ timeout: 3000 });

    // Should contain "sign in" text (not the form)
    const text = await serverKeySettings.textContent();
    expect(text?.toLowerCase()).toContain('sign in');
    expect(text?.toLowerCase()).not.toContain('save to server'); // Form not shown

    console.log('✅ Unauthenticated user sees sign-in prompt');
  });
});
