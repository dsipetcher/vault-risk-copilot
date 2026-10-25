import { z } from 'zod';

// Environment variables schema
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  RISK_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  RPC_URL: z.string().url().optional(),
  VAULT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_MAX: z.coerce.number().default(300),  // Higher default for SPA (was 100)
  RATE_LIMIT_WINDOW: z.string().default('15m'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LLM_KEY_ENCRYPTION_KEY: z.string().optional(),
  SIWE_DOMAIN: z.string().optional(),
  SIWE_URI: z.string().url().optional(),
  SIWE_CHAIN_ID: z.coerce.number().optional(),
  SIWE_CHAIN_IDS: z.string().optional(),
  RISK_INTERNAL_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const DEFAULT_SIWE_CHAIN_IDS = [31337, 11155111];

export function parseSiweChainIds(rawIds?: string, singleId?: number): number[] {
  const fromList = (rawIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (fromList.length > 0) {
    return [...new Set(fromList)];
  }
  if (singleId && Number.isInteger(singleId) && singleId > 0) {
    return [singleId];
  }
  return [...DEFAULT_SIWE_CHAIN_IDS];
}

// Only parse env if not in test mode or if DATABASE_URL is provided
export const env: Env = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL
  ? envSchema.parse({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    })
  : envSchema.parse(process.env);

export function getAllowedSiweChainIds(
  values: Pick<Env, 'SIWE_CHAIN_ID' | 'SIWE_CHAIN_IDS'> = env
): number[] {
  return parseSiweChainIds(values.SIWE_CHAIN_IDS, values.SIWE_CHAIN_ID);
}
