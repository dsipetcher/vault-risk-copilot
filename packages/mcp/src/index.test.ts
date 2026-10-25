import { describe, expect, it } from 'vitest';
import { parseTransport } from './cli.js';

describe('parseTransport', () => {
  it('defaults to stdio', () => {
    expect(parseTransport([])).toBe('stdio');
  });

  it('accepts --transport=http', () => {
    expect(parseTransport(['--transport=http'])).toBe('http');
  });

  it('accepts --transport http (space form)', () => {
    expect(parseTransport(['--transport', 'http'])).toBe('http');
  });
});
