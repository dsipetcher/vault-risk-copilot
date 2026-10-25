/**
 * JSON-RPC error thrown from MCP handlers.
 *
 * Do not throw the SDK `McpError` here: its constructor already prefixes
 * `MCP error ${code}:`, protocol.js then sends `error.message` as the JSON-RPC
 * message, and the client wraps it again — doubling the prefix.
 */
export function protocolError(code: number, message: string): Error & { code: number } {
  const error = new Error(message) as Error & { code: number };
  error.name = 'ProtocolError';
  error.code = code;
  return error;
}
