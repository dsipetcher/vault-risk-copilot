import { http, createConfig } from 'wagmi';
import { sepolia, foundry } from 'wagmi/chains';
import { injected, walletConnect, mock } from 'wagmi/connectors';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
const enableMockConnector = import.meta.env.VITE_ENABLE_MOCK_CONNECTOR === 'true';

// Anvil test account #0 (unlocked by default)
const ANVIL_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const connectors = enableMockConnector
  ? [mock({ 
      accounts: [ANVIL_ACCOUNT_0],
      features: { reconnect: true }
    })]
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
