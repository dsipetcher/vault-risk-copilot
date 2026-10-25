import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('MCP Server Integration Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let serverProcess: ReturnType<typeof spawn> | null = null;

  beforeAll(async () => {
    const mcpServerPath = new URL('./index.ts', import.meta.url).pathname;

    serverProcess = spawn('tsx', [mcpServerPath], {
      env: {
        ...process.env,
        API_BASE_URL,
        LOG_LEVEL: 'error',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!serverProcess.stdin || !serverProcess.stdout) {
      throw new Error('Failed to create server process');
    }

    transport = new StdioClientTransport({
      command: 'tsx',
      args: [mcpServerPath],
      env: {
        API_BASE_URL,
        LOG_LEVEL: 'error',
      },
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();

    expect(tools.tools).toBeDefined();
    expect(tools.tools.length).toBeGreaterThan(0);

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('list_pools');
    expect(toolNames).toContain('get_pool_risk');
    expect(toolNames).toContain('compare_pools');
    expect(toolNames).toContain('explain_pool_risk');
    expect(toolNames).toContain('get_vault_info');
  });

  it('should call list_pools tool', async () => {
    const result = await client.callTool({
      name: 'list_pools',
      arguments: {
        limit: 5,
      },
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    const textContent = result.content.find((c) => c.type === 'text');
    expect(textContent).toBeDefined();

    if (textContent && textContent.type === 'text') {
      expect(textContent.text).toContain('pools');
    }
  }, 10000);

  it('should call get_pool_risk with real pool data', async () => {
    const listResult = await client.callTool({
      name: 'list_pools',
      arguments: { limit: 1 },
    });

    const jsonContent = listResult.content.find((c) => c.type === 'text' && c.text.includes('pool_id'));
    expect(jsonContent).toBeDefined();

    if (jsonContent && jsonContent.type === 'text') {
      const parsed = JSON.parse(jsonContent.text);
      const poolId = parsed.pools[0].pool_id;

      const riskResult = await client.callTool({
        name: 'get_pool_risk',
        arguments: { pool_id: poolId },
      });

      expect(riskResult.content).toBeDefined();
      expect(riskResult.content.length).toBeGreaterThan(0);

      const textContent = riskResult.content.find((c) => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        expect(textContent.text).toContain('Risk Score');
      }
    }
  }, 15000);

  it('should handle unknown pool error', async () => {
    await expect(
      client.callTool({
        name: 'get_pool_risk',
        arguments: {
          pool_id: '00000000-0000-0000-0000-000000000000',
        },
      })
    ).rejects.toThrow();
  });

  it('should list resources', async () => {
    const resources = await client.listResources();

    expect(resources.resources).toBeDefined();
    expect(resources.resources.length).toBeGreaterThan(0);

    const methodologyResource = resources.resources.find(
      (r) => r.uri === 'methodology://risk-signals'
    );
    expect(methodologyResource).toBeDefined();
    expect(methodologyResource?.name).toBe('Risk Methodology');
  });

  it('should read methodology resource', async () => {
    const resource = await client.readResource({
      uri: 'methodology://risk-signals',
    });

    expect(resource.contents).toBeDefined();
    expect(resource.contents.length).toBe(1);
    expect(resource.contents[0].mimeType).toBe('text/markdown');

    if (resource.contents[0].mimeType === 'text/markdown' && 'text' in resource.contents[0]) {
      expect(resource.contents[0].text).toContain('Risk Methodology');
      expect(resource.contents[0].text).toContain('TVL Score');
    }
  });

  it('should list prompts', async () => {
    const prompts = await client.listPrompts();

    expect(prompts.prompts).toBeDefined();
    expect(prompts.prompts.length).toBeGreaterThan(0);

    const assessPrompt = prompts.prompts.find((p) => p.name === 'assess_pool_risk');
    expect(assessPrompt).toBeDefined();
    expect(assessPrompt?.arguments).toHaveLength(1);
  });

  it('should get assess_pool_risk prompt', async () => {
    const listResult = await client.callTool({
      name: 'list_pools',
      arguments: { limit: 1 },
    });

    const jsonContent = listResult.content.find((c) => c.type === 'text' && c.text.includes('pool_id'));
    if (jsonContent && jsonContent.type === 'text') {
      const parsed = JSON.parse(jsonContent.text);
      const poolId = parsed.pools[0].pool_id;

      const prompt = await client.getPrompt({
        name: 'assess_pool_risk',
        arguments: { pool_id: poolId },
      });

      expect(prompt.messages).toBeDefined();
      expect(prompt.messages.length).toBeGreaterThan(0);
      expect(prompt.messages[0].role).toBe('user');

      if (prompt.messages[0].content.type === 'text') {
        expect(prompt.messages[0].content.text).toContain('assess the risk');
      }
    }
  });
});
