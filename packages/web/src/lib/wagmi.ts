import { http, createConfig } from 'wagmi';
import { sepolia, foundry } from 'wagmi/chains';
import { injected, walletConnect, mock } from 'wagmi/connectors';
import { privateKeyToAccount } from 'viem/accounts';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
const enableMockConnector = import.meta.env.VITE_ENABLE_MOCK_CONNECTOR === 'true';

// Anvil test account #0
const testAccount = enableMockConnector
  ? privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
  : undefined;

const connectors = enableMockConnector && testAccount
  ? [mock({ accounts: [testAccount.address] })]
  : [
      injected(),
      ...(projectId ? [walletConnect({ projectId })] : []),
    ];

export const config = createConfig({
  chains: [foundry, sepolia],
  connectors,
  transports: {
    [foundry.id]: http(),
    [sepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
