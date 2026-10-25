import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.e2e.local if exists
let envVars: Record<string, string> = {};
try {
  const envPath = resolve(__dirname, '.env.e2e.local');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        envVars[key] = valueParts.join('=');
      }
    });
} catch {
  // Use env vars from process if file not found
  envVars = {
    VITE_VAULT_ADDRESS: process.env.VITE_VAULT_ADDRESS || '',
    VITE_USDC_ADDRESS: process.env.VITE_USDC_ADDRESS || '',
    VITE_ENABLE_MOCK_CONNECTOR: process.env.VITE_ENABLE_MOCK_CONNECTOR || '',
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /auth-siwe\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // SIWE must be exercised through a real injected wallet, so this project
      // runs against a second dev server with the auto-connecting mock wagmi
      // connector disabled.
      name: 'auth',
      testMatch: /auth-siwe\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: envVars,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { ...envVars, VITE_ENABLE_MOCK_CONNECTOR: 'false' },
    },
  ],
});
