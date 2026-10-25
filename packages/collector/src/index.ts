import cron from 'node-cron';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createDbClient, insertPoolSnapshot, insertVaultStateSnapshot } from './db.js';
import { fetchDefiLlamaPools } from './defillama.js';
import { VaultReader } from './vault-reader.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});

async function collectData() {
  const config = loadConfig();
  const sql = createDbClient(config.DATABASE_URL, logger);

  logger.info('🚀 Starting data collection cycle');

  try {
    const pools = await fetchDefiLlamaPools(config.DEFILLAMA_API_URL, logger);
    
    logger.info({ count: pools.length }, 'Inserting pool snapshots');
    for (const pool of pools) {
      await insertPoolSnapshot(sql, pool);
    }
    logger.info('✅ Pool snapshots inserted');

    if (config.VAULT_ADDRESS && config.RPC_URL) {
      const vaultReader = new VaultReader(
        config.RPC_URL,
        config.VAULT_ADDRESS as `0x${string}`,
        logger
      );
      const vaultState = await vaultReader.readVaultState();
      await insertVaultStateSnapshot(sql, vaultState);
      logger.info('✅ Vault state snapshot inserted');
    } else {
      logger.warn('⚠️  VAULT_ADDRESS or RPC_URL not configured, skipping vault state collection');
    }

    logger.info('✅ Data collection cycle completed');

    await triggerRiskRecompute(config, logger);
  } catch (error) {
    logger.error({ error }, '❌ Data collection failed');
  } finally {
    await sql.end();
  }
}

async function triggerRiskRecompute(
  config: ReturnType<typeof loadConfig>,
  log: typeof logger
): Promise<void> {
  if (!config.RISK_SERVICE_URL) {
    log.info('RISK_SERVICE_URL not set; skipping automatic risk recompute');
    return;
  }

  const url = `${config.RISK_SERVICE_URL.replace(/\/$/, '')}/recompute`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.RISK_INTERNAL_TOKEN) {
    headers['X-Internal-Token'] = config.RISK_INTERNAL_TOKEN;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pool_ids: null, force: true }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const body = await response.text();
      log.warn({ status: response.status, body }, 'Risk recompute request failed');
      return;
    }
    const result = (await response.json()) as { computed?: number };
    log.info({ computed: result.computed }, 'Triggered risk score recompute');
  } catch (error) {
    log.warn({ error }, 'Could not reach risk service for recompute');
  }
}

async function main() {
  const config = loadConfig();

  logger.info(
    {
      nodeEnv: config.NODE_ENV,
      intervalMs: config.COLLECTION_INTERVAL_MS,
    },
    'Vault Risk Collector starting'
  );

  await collectData();

  const intervalMinutes = Math.floor(config.COLLECTION_INTERVAL_MS / 60000);
  const cronExpression = `*/${intervalMinutes} * * * *`;
  
  logger.info({ cronExpression }, 'Scheduling recurring collection');
  
  cron.schedule(cronExpression, async () => {
    await collectData();
  });

  logger.info('✅ Collector initialized, waiting for scheduled runs');
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error in collector');
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});
