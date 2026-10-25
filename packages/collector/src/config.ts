import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  RPC_URL: z.string().min(1).url().optional().or(z.literal('')).optional(),
  MAINNET_RPC_URL: z.string().url().default('https://eth.llamarpc.com'),
  DEFILLAMA_API_URL: z.string().url().default('https://yields.llama.fi'),
  VAULT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')).optional(),
  COLLECTION_INTERVAL_MS: z.coerce.number().default(300000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  RISK_SERVICE_URL: z.string().url().optional().or(z.literal('')).optional(),
  RISK_INTERNAL_TOKEN: z.string().optional().or(z.literal('')).optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
    throw new Error('Configuration validation failed');
  }
  
  return result.data;
}
