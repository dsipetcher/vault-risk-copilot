export function parseTransport(args: string[]): string {
  const eqFlag = args.find((arg) => arg.startsWith('--transport='));
  const idx = args.indexOf('--transport');
  return eqFlag ? eqFlag.split('=')[1] : idx >= 0 ? (args[idx + 1] ?? '') : 'stdio';
}
