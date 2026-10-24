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
      const vaultReader = new VaultReader(config.RPC_URL, config.VAULT_ADDRESS, logger);
      const vaultState = await vaultReader.readVaultState();
      await insertVaultStateSnapshot(sql, vaultState);
      logger.info('✅ Vault state snapshot inserted');
    } else {
      logger.warn('⚠️  VAULT_ADDRESS or RPC_URL not configured, skipping vault state collection');
    }

    logger.info('✅ Data collection cycle completed');
  } catch (error) {
    logger.error({ error }, '❌ Data collection failed');
  } finally {
    await sql.end();
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
