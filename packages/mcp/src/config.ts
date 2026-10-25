import { z } from 'zod';

const configSchema = z.object({
  apiBaseUrl: z.string().url(),
  llmApiKey: z.string().optional(),
  llmProvider: z.enum(['openai', 'openrouter', 'groq', 'ollama', 'mock']).optional(),
  llmModel: z.string().optional(),
  httpPort: z.coerce.number().int().min(1).max(65535).default(3001),
  httpHost: z.string().default('localhost'),
  httpAuthToken: z.string().optional(),
  requestTimeoutMs: z.coerce.number().int().min(1000).default(30000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
}).refine((c) => !c.llmApiKey || c.llmProvider, {
  // Without a provider the API defaults to openai and would send the key to the wrong vendor.
  message: 'X_LLM_PROVIDER is required when X_LLM_API_KEY is set',
  path: ['llmProvider'],
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = configSchema.parse({
    apiBaseUrl: process.env.API_BASE_URL,
    llmApiKey: process.env.X_LLM_API_KEY,
    llmProvider: process.env.X_LLM_PROVIDER || undefined,
    llmModel: process.env.X_LLM_MODEL || undefined,
    httpPort: process.env.HTTP_PORT,
    httpHost: process.env.HTTP_HOST,
    httpAuthToken: process.env.HTTP_AUTH_TOKEN,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
    logLevel: process.env.LOG_LEVEL,
  });

  return config;
}
