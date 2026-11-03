import type { Logger } from 'pino';
import {
  HyperliquidClient,
  type HyperliquidClientOptions,
  type HyperliquidPerpSnapshot,
} from '@vault-risk-copilot/hyperliquid';

export {
  ALLOWED_HYPERLIQUID_HOSTS,
  DEFAULT_HYPERLIQUID_API_URL,
  DEFAULT_HYPERLIQUID_TIMEOUT_MS,
  HyperliquidClient,
  HyperliquidError,
  RATE_LIMIT_DEFAULT_WAIT_MS,
  RATE_LIMIT_HTTP_ATTEMPTS,
  RATE_LIMIT_PER_WAIT_CAP_MS,
  RATE_LIMIT_TOTAL_WAIT_CAP_MS,
  backoffWaitMs,
  fundingHistorySchema,
  metaAndAssetCtxsSchema,
  parseRetryAfterMs,
  readJsonWithSignal,
  resolveHyperliquidBaseUrl,
} from '@vault-risk-copilot/hyperliquid';
export type {
  FundingHistoryPoint,
  HyperliquidClientOptions,
  HyperliquidLogger,
  HyperliquidPerpSnapshot,
} from '@vault-risk-copilot/hyperliquid';

export async function fetchHyperliquidPerpSnapshots(
  apiUrl: string,
  logger: Logger,
  options: Omit<HyperliquidClientOptions, 'apiUrl' | 'logger'> = {}
): Promise<HyperliquidPerpSnapshot[]> {
  const client = new HyperliquidClient({ apiUrl, logger, ...options });
  return client.fetchPerpSnapshots();
}
