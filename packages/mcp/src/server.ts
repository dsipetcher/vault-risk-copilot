import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config } from './config.js';
import { ApiClient } from './api-client.js';
import { protocolError } from './protocol-error.js';
import {
  listPoolsTool,
  getPoolRiskTool,
  comparePoolsTool,
  explainPoolRiskTool,
  getVaultInfoTool,
  toolErrorResult,
} from './tools.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METHODOLOGY_CONTENT = `# Vault Risk Copilot - Risk Methodology

## Overview

This system evaluates DeFi pool risk using explainable signals. The risk score is a weighted combination of individual signal scores, ranging from 0 (low risk) to 100 (high risk).

## Risk Signals

### 1. TVL Score (Total Value Locked)
- Higher TVL generally indicates lower risk (more liquidity, harder to manipulate)
- Very low TVL (< $100k) increases risk
- Score range: 0-20

### 2. TVL Volatility Score
- Measures stability of total value locked over time
- High volatility indicates unstable pool or market conditions
- Score range: 0-15

### 3. APY Volatility Score
- Tracks fluctuations in annual percentage yield
- High APY volatility suggests unstable returns or pool composition changes
- Score range: 0-20

### 4. Reward Ratio Score
- Ratio of incentive rewards to base yield
- High reward ratio may indicate unsustainable incentives
- Score range: 0-15

### 5. Stablecoin Score
- Stablecoin pools are generally lower risk (less IL, less price volatility)
- Volatile asset pools have higher risk
- Score range: 0-10

### 6. Impermanent Loss (IL) Score
- AMM pools with multiple assets are subject to impermanent loss
- Single-asset lending pools have no IL risk
- Score range: 0-10

### 7. Data Age Score
- Freshness of data (recent snapshots are more reliable)
- Stale data increases uncertainty
- Score range: 0-5

### 8. Vault Score
- Specific to vaults: checks for deployment, audit status, track record
- Score range: 0-5

### 9. Anomaly Detection
- Statistical outliers flagged via z-score and IsolationForest
- Anomalies add +10 to total risk score

## Risk Categories

- **Low**: 0-25
- **Medium**: 26-50
- **High**: 51-75
- **Critical**: 76+

## Limitations

⚠️ **This is a learning project and NOT financial advice.**

- Does not account for smart contract risk or audit status
- Does not predict future performance
- Historical data may not reflect current conditions
- Simplified model for educational purposes
- No regulatory or legal risk assessment

## Data Sources

- DeFiLlama Yields API (pool snapshots)
- On-chain reads (vault state, mainnet via viem)
- Testnet deployment (Sepolia for vault contract)

## Model Version

Current version: v1.0 (as of Phase 7)
`;

export function createServer(config: Config): Server {
  const server = new Server(
    {
      name: 'vault-risk-copilot',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  const apiClient = new ApiClient(config);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_pools',
          description:
            'List DeFi pools with optional filters. Returns pool metadata, TVL, APY, and risk scores. ' +
            'Use this to discover available pools or filter by chain, protocol, or minimum TVL. ' +
            'Results are paginated (max 50 per request).',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of pools to return (1-50, default: 20)',
                minimum: 1,
                maximum: 50,
                default: 20,
              },
              offset: {
                type: 'number',
                description: 'Pagination offset (default: 0)',
                minimum: 0,
                default: 0,
              },
              chain: {
                type: 'string',
                description: 'Filter by blockchain (e.g., "Ethereum", "Arbitrum")',
              },
              protocol: {
                type: 'string',
                description: 'Filter by protocol (e.g., "Aave", "Uniswap")',
              },
              min_tvl: {
                type: 'number',
                description: 'Minimum TVL in USD (e.g., 1000000 for $1M+)',
                minimum: 0,
              },
              sort: {
                type: 'string',
                enum: ['tvl', 'risk', 'apy'],
                description: 'Sort order: "tvl" (highest first), "risk" (highest risk first), "apy" (highest first)',
              },
            },
          },
        },
        {
          name: 'get_pool_risk',
          description:
            'Get detailed risk analysis for a specific pool by ID. Returns risk score breakdown, ' +
            'individual signal scores, anomaly flags, and a 7-day history window. ' +
            'Use this after list_pools to dive into a specific pool.',
          inputSchema: {
            type: 'object',
            properties: {
              pool_id: {
                type: 'string',
                description: 'UUID of the pool (from list_pools)',
                format: 'uuid',
              },
            },
            required: ['pool_id'],
          },
        },
        {
          name: 'compare_pools',
          description:
            'Compare 2-5 pools side-by-side. Returns risk scores, TVL, APY, and key metrics for each pool. ' +
            'Results are sorted by risk score (highest first). Use this to evaluate multiple options.',
          inputSchema: {
            type: 'object',
            properties: {
              pool_ids: {
                type: 'array',
                items: { type: 'string', format: 'uuid' },
                description: 'Array of 2-5 pool UUIDs to compare',
                minItems: 2,
                maxItems: 5,
              },
            },
            required: ['pool_ids'],
          },
        },
        {
          name: 'explain_pool_risk',
          description:
            'Get a natural-language explanation of a pool\'s risk factors using LLM analysis. ' +
            'Returns a human-readable summary and key factor breakdowns. ' +
            'If LLM API key is not configured (via X_LLM_API_KEY env var), returns a fallback explanation. ' +
            'Explanations are cached for performance.',
          inputSchema: {
            type: 'object',
            properties: {
              pool_id: {
                type: 'string',
                description: 'UUID of the pool (from list_pools)',
                format: 'uuid',
              },
            },
            required: ['pool_id'],
          },
        },
        {
          name: 'get_vault_info',
          description:
            'Get current state of the ERC-4626 vault (MockUSDC + SimpleVault) when it is deployed locally. ' +
            'Returns vault address, total assets, total supply, share price, and block number. ' +
            'Explains that the vault is not deployed in the public demo if VAULT_ADDRESS/RPC are unset.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_pools':
          return await listPoolsTool(apiClient, (args as Record<string, unknown>) ?? {});

        case 'get_pool_risk':
          return await getPoolRiskTool(apiClient, (args as Record<string, unknown>) ?? {});

        case 'compare_pools':
          return await comparePoolsTool(apiClient, (args as Record<string, unknown>) ?? {});

        case 'explain_pool_risk':
          return await explainPoolRiskTool(apiClient, (args as Record<string, unknown>) ?? {}, config.llmApiKey);

        case 'get_vault_info':
          return await getVaultInfoTool(apiClient);

        default:
          return toolErrorResult(new Error(`Unknown tool: ${String(name).slice(0, 64)}`));
      }
    } catch (error) {
      // Tool failures must be returned as isError results (MCP spec), not protocol errors.
      return toolErrorResult(error);
    }
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'pool://{id}',
        name: 'Pool risk snapshot',
        mimeType: 'application/json',
        description: 'Latest pool data, risk score and signals for a pool UUID',
      },
    ],
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'methodology://risk-signals',
          name: 'Risk Methodology',
          mimeType: 'text/markdown',
          description: 'Explanation of risk signals, scoring model, and limitations',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'methodology://risk-signals') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: METHODOLOGY_CONTENT,
          },
        ],
      };
    }

    if (uri.startsWith('pool://')) {
      const id = uri.slice('pool://'.length);
      if (!UUID_RE.test(id)) {
        throw protocolError(ErrorCode.InvalidParams, 'pool:// id must be a UUID');
      }
      try {
        const pool = await apiClient.getPoolRisk(id);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(pool, null, 2) }] };
      } catch (error) {
        const text = toolErrorResult(error).content[0].text.replace(/^MCP error -?\d+:\s*/i, '');
        throw protocolError(ErrorCode.InvalidParams, text);
      }
    }

    throw protocolError(ErrorCode.InvalidParams, 'Unknown resource');
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'assess_pool_risk',
          description: 'Assess the risk of a DeFi pool and provide recommendations',
          arguments: [
            {
              name: 'pool_id',
              description: 'UUID of the pool to assess',
              required: true,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'assess_pool_risk') {
      const poolId = args?.pool_id as string | undefined;
      if (!poolId) {
        throw new Error('pool_id is required');
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Please assess the risk of pool ${poolId} using the following steps:\n\n` +
                `1. Use get_pool_risk to retrieve detailed risk data\n` +
                `2. Use explain_pool_risk to get a natural-language explanation\n` +
                `3. Analyze the key risk factors and their scores\n` +
                `4. Provide a summary with:\n` +
                `   - Overall risk assessment (low/medium/high/critical)\n` +
                `   - Top 3 risk factors to be aware of\n` +
                `   - Any anomalies or red flags\n` +
                `   - Comparison to similar pools (if applicable)\n\n` +
                `Remember: This is educational data only. Do not provide financial advice.`,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

  return server;
}

export async function runStdioServer(config: Config): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.logLevel !== 'error') {
    console.error('[MCP] Vault Risk Copilot server running on stdio');
    console.error(`[MCP] API Base URL: ${config.apiBaseUrl}`);
    console.error(`[MCP] LLM API Key: ${config.llmApiKey ? 'configured' : 'not configured (fallback mode)'}`);
  }
}
