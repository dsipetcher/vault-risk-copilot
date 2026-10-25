import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useConnect, useAccount } from 'wagmi';
import { useEffect } from 'react';
import { config } from './lib/wagmi';
import { Layout } from './components/Layout';
import { PoolsPage } from './pages/PoolsPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { VaultPage } from './pages/VaultPage';
import { NotFoundPage } from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function AutoConnect() {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  
  useEffect(() => {
    const enableMock = import.meta.env.VITE_ENABLE_MOCK_CONNECTOR === 'true';
    if (enableMock && !isConnected) {
      const mockConnector = connectors.find(c => c.id === 'mock' || c.name === 'Mock');
      if (mockConnector) {
        setTimeout(() => {
          connect({ connector: mockConnector });
        }, 100);
      }
    }
  }, [connect, connectors, isConnected]);
  
  return null;
}

function App() {
  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <AutoConnect />
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/pools" replace />} />
              <Route path="pools" element={<PoolsPage />} />
              <Route path="pools/:id" element={<PoolDetailPage />} />
              <Route path="vault" element={<VaultPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
