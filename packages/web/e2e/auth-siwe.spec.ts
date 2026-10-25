import { test, expect } from '@playwright/test';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * E2E: Sign-In With Ethereum + server-stored (encrypted) LLM key.
 *
 * - Wallet: injected EIP-1193 provider (EIP-6963 announced) whose personal_sign
 *   is delegated to a viem account in the test process. Runs against the
 *   "auth" web server (mock wagmi connector DISABLED), so the signature can
 *   only come from this injected wallet.
 * - LLM: a stub OpenAI-compatible server on the Ollama default URL
 *   (http://localhost:11434/v1). The API only reaches it with the key it
 *   decrypted from the DB, so asserting the Authorization header the stub
 *   received proves the stored key was used end to end.
 */

// anvil account #1 — deliberately NOT #0 (the wagmi mock connector's account),
// so a signature from any other source would yield the wrong address.
const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';
const SEEDED_POOL_ID = '11111111-1111-1111-1111-111111111111'; // db/e2e-seed.sql
const DUMMY_KEY = 'e2e-dummy-key-5678';
const STUB_PORT = 11434;

// ---- Stub LLM (OpenAI-compatible) -------------------------------------------
let stub: Server;
const stubRequests: { headers: IncomingHttpHeaders; model?: string }[] = [];

/** Build a schema- and number-fidelity-valid explanation from the prompt itself. */
function explanationFromPrompt(prompt: string): string {
  const score = /Risk Score: ([\d.]+)\/100/.exec(prompt)?.[1] ?? '0';
  const breakdown = prompt.split('=== RISK BREAKDOWN ===')[1]?.split('===')[0] ?? '';
  const key_factors = breakdown
    .split('\n')
    .map((l) => /^([A-Za-z ]+): ([\d.]+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      signal: m[1],
      value: m[2],
      explanation: 'This signal contributes to the overall pool risk assessment.',
    }));
  return JSON.stringify({
    summary: `Stub explanation: this pool has a total risk score of ${score}.`,
    key_factors,
    disclaimer: 'Stub output for automated tests only. Not financial advice.',
  });
}

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        const parsed = JSON.parse(body);
        stubRequests.push({ headers: req.headers, model: parsed.model });
        const user = parsed.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'stub',
            object: 'chat.completion',
            created: 0,
            model: parsed.model,
            choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: explanationFromPrompt(user) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
      } else {
        res.writeHead(404).end();
      }
    });
  });
  await new Promise<void>((r) => stub.listen(STUB_PORT, '127.0.0.1', r));
});

test.afterAll(async () => {
  await new Promise<void>((r) => stub.close(() => r()));
});

// ---- Injected wallet --------------------------------------------------------
let signCalls = 0;

test.beforeEach(async ({ page }) => {
  signCalls = 0;
  await page.exposeFunction('__e2eSign', async (rawHex: string) => {
    signCalls++;
    // personal_sign param is the hex-encoded message: sign the raw bytes.
    return testAccount.signMessage({ message: { raw: rawHex as Hex } });
  });

  await page.addInitScript((address: string) => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    let connected = false;
    const ethereum = {
      isMetaMask: true,
      async request({ method, params }: { method: string; params?: unknown[] }) {
        switch (method) {
          case 'eth_requestAccounts':
            connected = true;
            return [address];
          case 'eth_accounts':
            return connected ? [address] : [];
          case 'eth_chainId':
            return '0x7a69'; // 31337
          case 'wallet_requestPermissions':
          case 'wallet_revokePermissions':
            if (method === 'wallet_revokePermissions') connected = false;
            return [{ parentCapability: 'eth_accounts' }];
          case 'wallet_switchEthereumChain':
            return null;
          case 'personal_sign': {
            const [msg, from] = params as [string, string];
            if (from.toLowerCase() !== address.toLowerCase()) throw new Error('wrong signer');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__e2eSign(msg);
          }
          default:
            throw Object.assign(new Error(`Unsupported method: ${method}`), { code: 4200 });
        }
      },
      on(event: string, fn: (...a: unknown[]) => void) {
        (listeners[event] ||= []).push(fn);
      },
      removeListener(event: string, fn: (...a: unknown[]) => void) {
        listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = ethereum;
    const info = { uuid: 'e2e-wallet', name: 'E2E Wallet', icon: 'data:image/svg+xml,<svg/>', rdns: 'io.e2e.wallet' };
    const announce = () =>
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider: ethereum }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  }, testAccount.address);
});

// ---- Tests ------------------------------------------------------------------
test('SIWE: sign in → address → reload persists → save key → masked hint → explain uses stored key → sign out', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);

  await page.goto('/');
  await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 15000 });

  // Connect + sign in
  await page.getByTestId('auth-connect-button').click();
  await page.getByTestId('auth-sign-in-button').click();
  const address = page.getByTestId('auth-address-display');
  await expect(address).toBeVisible({ timeout: 10000 });
  expect(signCalls).toBe(1); // signature came from the injected wallet
  await expect(address).toHaveText(`${testAccount.address.slice(0, 6)}...${testAccount.address.slice(-4)}`);

  // Server agrees on the session identity
  const me = await page.request.get(`${API_URL}/api/auth/me`);
  expect(me.status()).toBe(200);
  expect((await me.json()).address.toLowerCase()).toBe(testAccount.address.toLowerCase());

  // Reload persists (HttpOnly session cookie, sent cross-origin with credentials)
  await page.reload();
  await expect(page.getByTestId('auth-address-display')).toBeVisible({ timeout: 10000 });
  expect(signCalls).toBe(1); // no re-sign needed

  // Save a dummy key on the server
  await page.getByTestId('llm-settings-button').click();
  await expect(page.getByTestId('server-key-settings')).toBeVisible();
  await page.getByTestId('server-provider-select').selectOption('ollama');
  await page.getByTestId('server-api-key-input').fill(DUMMY_KEY);
  await page.getByTestId('server-key-save-button').click();
  await expect(page.getByTestId('server-key-success')).toBeVisible({ timeout: 5000 });

  // Masked hint only — the full key must never come back to the browser
  const stored = page.getByTestId('stored-key-ollama');
  await expect(stored).toContainText('5678');
  await expect(stored).toContainText('*');
  expect(await page.content()).not.toContain(DUMMY_KEY);

  // Client settings: provider ollama, NO client key, default base URL (server-side),
  // unique model so the explanation cache cannot short-circuit the call.
  const model = `e2e-${Date.now()}`;
  await page.getByTestId('provider-select').selectOption('ollama');
  await page.getByTestId('model-input').fill(model);
  await page.getByTestId('base-url-input').fill('');
  await expect(page.getByTestId('api-key-input')).toHaveValue('');
  await page.getByTestId('save-settings-button').click();
  await expect(page.getByTestId('llm-settings-dialog')).toBeHidden();

  // Explain on the seeded pool → must go through the stub with the stored key
  await page.goto(`/pools/${SEEDED_POOL_ID}`);
  await page.getByTestId('explain-button').click();
  await expect(page.getByTestId('explanation-summary')).toContainText('Stub explanation: this pool', { timeout: 15000 });
  await expect(page.getByTestId('fallback-warning')).toHaveCount(0);
  const calls = stubRequests.filter((r) => r.model === model);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0].headers.authorization).toBe(`Bearer ${DUMMY_KEY}`);

  // Sign out → old session token is revoked server-side
  const session = (await context.cookies(API_URL)).find((c) => c.name === 'vault_session');
  expect(session).toBeTruthy();
  await page.getByTestId('auth-sign-out-button').click();
  await expect(page.getByTestId('auth-connect-button')).toBeVisible({ timeout: 10000 });

  const loggedOut = await page.request.get(`${API_URL}/api/auth/me`);
  expect(loggedOut.status()).toBe(200);
  expect((await loggedOut.json()).authenticated).toBe(false);
  const replay = await fetch(`${API_URL}/api/auth/me`, { headers: { cookie: `vault_session=${session!.value}` } });
  expect(replay.status).toBe(200);
  expect((await replay.json()).authenticated).toBe(false);

  await page.reload();
  await expect(page.getByTestId('auth-connect-button')).toBeVisible({ timeout: 10000 });
});

test('unauthenticated user sees sign-in prompt in server key settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('pools-title')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('llm-settings-button').click();
  const settings = page.getByTestId('server-key-settings');
  await expect(settings).toContainText(/sign in/i);
  await expect(page.getByTestId('server-key-save-button')).toHaveCount(0);
});
