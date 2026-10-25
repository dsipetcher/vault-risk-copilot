import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const SEEDED_HIGH = '11111111-1111-1111-1111-111111111111';
const SEEDED_MED = '22222222-2222-2222-2222-222222222222';
const SEEDED_LOW = '33333333-3333-3333-3333-333333333333';

function textBlocks(result: { content: unknown }): Array<{ type: string; text: string }> {
  return (result.content as Array<{ type: string; text: string }>).filter((c) => c.type === 'text');
}

function parseJsonBlock(result: { content: unknown }): Record<string, unknown> {
  const json = textBlocks(result).find((c) => c.text.trim().startsWith('{'));
  if (!json) throw new Error('No JSON content block');
  return JSON.parse(json.text) as Record<string, unknown>;
}

describe('MCP Server Integration Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const mcpServerPath = new URL('./index.ts', import.meta.url).pathname;

    transport = new StdioClientTransport({
      command: 'tsx',
      args: [mcpServerPath],
      env: {
        ...process.env,
        API_BASE_URL,
        LOG_LEVEL: 'error',
      },
    });

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'list_pools',
        'get_pool_risk',
        'compare_pools',
        'explain_pool_risk',
        'get_vault_info',
      ])
    );
    expect(tools.tools).toHaveLength(5);
  });

  it('should list seeded pools with real TVL/APY values', async () => {
    const result = await client.callTool({
      name: 'list_pools',
      arguments: { limit: 5, sort: 'tvl' },
    });
    expect(result.isError).toBeFalsy();

    const parsed = parseJsonBlock(result) as {
      pools: Array<{ pool_id: string; protocol: string; tvl_usd: number; apy: number }>;
      pagination: { total: number };
    };
    expect(parsed.pools.length).toBeGreaterThanOrEqual(3);
    expect(parsed.pagination.total).toBeGreaterThanOrEqual(3);

    const ids = parsed.pools.map((p) => p.pool_id);
    expect(ids).toEqual(expect.arrayContaining([SEEDED_HIGH, SEEDED_MED, SEEDED_LOW]));

    const high = parsed.pools.find((p) => p.pool_id === SEEDED_HIGH);
    expect(high?.protocol).toBe('test-protocol-high');
    expect(high?.tvl_usd).toBe(500000);
    expect(high?.apy).toBe(25.5);

    const low = parsed.pools.find((p) => p.pool_id === SEEDED_LOW);
    expect(low?.protocol).toBe('compound-v3');
    expect(low?.tvl_usd).toBe(50000000);
  }, 10000);

  it('should return the seeded high-risk pool from get_pool_risk', async () => {
    const riskResult = await client.callTool({
      name: 'get_pool_risk',
      arguments: { pool_id: SEEDED_HIGH },
    });
    expect(riskResult.isError).toBeFalsy();
    expect(textBlocks(riskResult)[0].text).toContain('test-protocol-high');
    expect(textBlocks(riskResult)[0].text).toMatch(/72\.50|high/i);

    const parsed = parseJsonBlock(riskResult) as {
      pool_id: string;
      tvl_usd: number;
      apy: number;
      signals: { tvl_score: number } | null;
    };
    expect(parsed.pool_id).toBe(SEEDED_HIGH);
    expect(parsed.tvl_usd).toBe(500000);
    expect(parsed.apy).toBe(25.5);
    expect(parsed.signals?.tvl_score).toBe(85);
  }, 15000);

  it('should return isError for unknown pool', async () => {
    const result = await client.callTool({
      name: 'get_pool_risk',
      arguments: { pool_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0].text).toMatch(/not found/i);
  });

  it('should return isError for invalid input', async () => {
    const result = await client.callTool({ name: 'list_pools', arguments: { limit: 999 } });
    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0].text).toMatch(/^Invalid input: limit/);
  });

  it('should explain a seeded pool (mock LLM in CI)', async () => {
    const result = await client.callTool({
      name: 'explain_pool_risk',
      arguments: { pool_id: SEEDED_HIGH },
    });
    expect(result.isError).toBeFalsy();
    expect(textBlocks(result)[0].text.length).toBeGreaterThan(20);
    expect(textBlocks(result)[0].text).toMatch(/disclaimer|educational|not financial/i);
  }, 30000);

  it('does not double-prefix resource protocol errors', async () => {
    await expect(client.readResource({ uri: 'pool://not-a-uuid' })).rejects.toMatchObject({
      message: 'MCP error -32602: pool:// id must be a UUID',
    });
    await expect(client.readResource({ uri: 'unknown://x' })).rejects.toMatchObject({
      message: 'MCP error -32602: Unknown resource',
    });
  });

  it('should expose and read the pool://{id} resource template', async () => {
    const t = await client.listResourceTemplates();
    expect(t.resourceTemplates.map((r) => r.uriTemplate)).toContain('pool://{id}');
    const r = await client.readResource({ uri: `pool://${SEEDED_HIGH}` });
    const pool = JSON.parse((r.contents[0] as { text: string }).text);
    expect(pool.pool_id).toBe(SEEDED_HIGH);
    expect(pool.risk_score?.total_risk_score ?? pool.total_risk_score).toBe(72.5);
  });

  it('get_vault_info distinguishes an unconfigured vault from a generic failure', async () => {
    const result = await client.callTool({ name: 'get_vault_info', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textBlocks(result)[0].text).toMatch(
      /not deployed|MockUSDC|Anvil|Vault State \(ERC-4626\)/i
    );
    expect(textBlocks(result)[0].text).not.toMatch(/may not be deployed or API does not support/);
  });

  it('should list and read the methodology resource', async () => {
    const resources = await client.listResources();
    expect(resources.resources.map((r) => r.uri)).toContain('methodology://risk-signals');

    const resource = await client.readResource({ uri: 'methodology://risk-signals' });
    expect(resource.contents[0].mimeType).toBe('text/markdown');
    expect((resource.contents[0] as { text: string }).text).toContain('TVL Score');
  });

  it('should list and render the assess_pool_risk prompt', async () => {
    const prompts = await client.listPrompts();
    const assessPrompt = prompts.prompts.find((p) => p.name === 'assess_pool_risk');
    expect(assessPrompt?.arguments).toHaveLength(1);

    const prompt = await client.getPrompt({
      name: 'assess_pool_risk',
      arguments: { pool_id: SEEDED_HIGH },
    });
    expect(prompt.messages[0].role).toBe('user');
    expect((prompt.messages[0].content as { text: string }).text).toContain(SEEDED_HIGH);
  });
});

describe('MCP Server error path (API down)', () => {
  let client: Client;

  beforeAll(async () => {
    const mcpServerPath = new URL('./index.ts', import.meta.url).pathname;
    const transport = new StdioClientTransport({
      command: 'tsx',
      args: [mcpServerPath],
      env: {
        ...process.env,
        API_BASE_URL: 'http://127.0.0.1:1',
        LOG_LEVEL: 'error',
      },
    });
    client = new Client({ name: 'down-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
  });

  it('should return isError when the risk API is unreachable', async () => {
    const result = await client.callTool({ name: 'list_pools', arguments: { limit: 1 } });
    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0].text).toMatch(/unreachable|timed out|Risk API/i);
  });
});
