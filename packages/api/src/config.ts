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
});

export type Env = z.infer<typeof envSchema>;

// Only parse env if not in test mode or if DATABASE_URL is provided
export const env: Env = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL
  ? envSchema.parse({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    })
  : envSchema.parse(process.env);
