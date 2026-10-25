import { z } from 'zod';

const configSchema = z.object({
  apiBaseUrl: z.string().url(),
  llmApiKey: z.string().optional(),
  httpPort: z.coerce.number().int().min(1).max(65535).default(3001),
  httpHost: z.string().default('localhost'),
  httpAuthToken: z.string().optional(),
  requestTimeoutMs: z.coerce.number().int().min(1000).default(30000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = configSchema.parse({
    apiBaseUrl: process.env.API_BASE_URL,
    llmApiKey: process.env.X_LLM_API_KEY,
    httpPort: process.env.HTTP_PORT,
    httpHost: process.env.HTTP_HOST,
    httpAuthToken: process.env.HTTP_AUTH_TOKEN,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
    logLevel: process.env.LOG_LEVEL,
  });

  return config;
}
