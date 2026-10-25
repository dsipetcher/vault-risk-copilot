#!/usr/bin/env node

import { loadConfig } from './config.js';
import { parseTransport } from './cli.js';
import { createServer, runStdioServer } from './server.js';
import { runHttpServer } from './http-transport.js';

async function main() {
  const args = process.argv.slice(2);
  const transport = parseTransport(args);

  if (transport !== 'stdio' && transport !== 'http') {
    console.error('Error: --transport must be "stdio" or "http"');
    process.exit(1);
  }

  try {
    const config = loadConfig();

    if (transport === 'stdio') {
      await runStdioServer(config);
    } else if (transport === 'http') {
      await runHttpServer(() => createServer(config), config);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Unknown error:', error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
