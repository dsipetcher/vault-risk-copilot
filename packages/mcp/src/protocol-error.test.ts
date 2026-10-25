import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { protocolError } from './protocol-error.js';

describe('protocolError', () => {
  it('keeps the JSON-RPC message unprefixed so the client wraps it once', () => {
    const error = protocolError(ErrorCode.InvalidParams, 'pool:// id must be a UUID');
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe('pool:// id must be a UUID');
    expect(error.message).not.toMatch(/^MCP error /);
  });
});
