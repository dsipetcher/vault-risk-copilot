import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from './openai.js';
import { InvalidKeyError } from '../errors.js';
import { RateLimitError } from '../rate-limit.js';
import type { RiskInput } from '../schemas.js';

const input: RiskInput = {
  pool_id: '123e4567-e89b-12d3-a456-426614174000',
  pool_name: 'Test',
  protocol: 'aave',
  chain: 'Ethereum',
  total_risk_score: 10,
  risk_category: 'low',
  breakdown: {
    tvl_score: 5,
    tvl_volatility_score: null,
    apy_volatility_score: null,
    reward_ratio_score: null,
    stablecoin_score: null,
    il_score: null,
    data_age_score: null,
    vault_score: null,
  },
  pool_metrics: {
    tvl_usd: 1_000_000,
    tvl_change_7d_pct: null,
    apy: null,
    apy_base: null,
    apy_reward: null,
    apy_sigma: null,
    il_risk: null,
    is_stablecoin: false,
    count: null,
  },
};

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('OpenAIProvider.validateConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('succeeds when GET /models returns 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider({ apiKey: 'gsk_ok', baseUrl: 'https://api.groq.com/openai/v1' });
    await expect(provider.validateConnection()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models');
  });

  it('maps 401 from /models to InvalidKeyError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider({ apiKey: 'gsk_bad', baseUrl: 'https://api.groq.com/openai/v1' });
    await expect(provider.validateConnection()).rejects.toBeInstanceOf(InvalidKeyError);
  });

  it('maps 403 from the 1-token fallback to InvalidKeyError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider({ apiKey: 'gsk_bad' });
    await expect(provider.validateConnection()).rejects.toBeInstanceOf(InvalidKeyError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('OpenAIProvider rate limit handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('honors Retry-After with one bounded HTTP retry and does not burn a validation attempt', async () => {
    const okBody = {
      id: '1',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: 'Score 10.0 with TVL 1000000.',
              key_factors: [
                { signal: 'TVL Score', value: '5.0/100', explanation: 'TVL of 1000000 is listed.' },
              ],
              disclaimer: 'This is educational only and not financial advice.',
            }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };

    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return jsonResponse(okBody);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIProvider({ apiKey: 'gsk_ok' });
    const result = await provider.generate(input);

    expect(result.metadata.fallback).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 up to 3 HTTP attempts and does not add a validation retry', async () => {
    const fetchMock = vi.fn(async () => new Response('still limited', { status: 429, headers: { 'Retry-After': '0' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIProvider({ apiKey: 'gsk_ok' });
    const result = await provider.generate(input);

    expect(result.metadata.fallback).toBe(true);
    expect(result.metadata.fallback_reason).toBe('rate_limited');
    expect(result.output.summary).toMatch(/Rate limited by the provider/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not issue a validation retry after a 429 backoff that then returns an unfixable body', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return jsonResponse({
        id: '1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"not":"valid"}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIProvider({ apiKey: 'gsk_ok' });
    const result = await provider.generate(input);
    expect(result.metadata.fallback).toBe(true);
    expect(result.metadata.fallback_reason).toBe('validation_failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a numeric key_factors value without a second HTTP call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: '1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                summary: 'Score 10.0 with TVL 1000000 and APY notes.',
                key_factors: [
                  { signal: 'TVL Score', value: 5, explanation: 'TVL score 5.0 with TVL 1000000.' },
                ],
                disclaimer: 'This is educational only and not financial advice.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider({ apiKey: 'gsk_ok' });
    const result = await provider.generate(input);
    expect(result.metadata.fallback).toBeUndefined();
    expect(result.output.key_factors[0].value).toBe('5');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parse path: RateLimitError is the typed failure after retry', async () => {
    const fetchMock = vi.fn(async () => new Response('still limited', { status: 429, headers: { 'Retry-After': '0' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider({ apiKey: 'gsk_ok' });
    const call = Reflect.get(provider, 'callOpenAI') as (
      system: string,
      user: string
    ) => Promise<unknown>;
    await expect(call.call(provider, 's', 'u')).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
