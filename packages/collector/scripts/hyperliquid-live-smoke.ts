/**
 * Optional live smoke against Hyperliquid's public Info API.
 * Not run in CI. Requires RUN_HYPERLIQUID_LIVE_SMOKE=1.
 *
 *   RUN_HYPERLIQUID_LIVE_SMOKE=1 npx tsx scripts/hyperliquid-live-smoke.ts
 */
import { HyperliquidClient } from '../src/hyperliquid.js';

async function main() {
  if (process.env.RUN_HYPERLIQUID_LIVE_SMOKE !== '1') {
    console.error('Refusing to hit the live network. Set RUN_HYPERLIQUID_LIVE_SMOKE=1 to run this script.');
    process.exit(2);
  }

  const client = new HyperliquidClient({
    apiUrl: process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz',
  });

  const markets = await client.fetchPerpSnapshots();
  const btc = markets.find((m) => m.coin === 'BTC');
  const startTime = Date.now() - 24 * 60 * 60 * 1000;
  const history = await client.fetchFundingHistory('ETH', startTime);

  console.log(
    JSON.stringify(
      {
        markets: markets.length,
        btc_funding: btc?.funding_rate ?? null,
        btc_mark: btc?.mark_px ?? null,
        eth_funding_points: history.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'live smoke failed');
  process.exit(1);
});
