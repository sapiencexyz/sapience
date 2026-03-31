import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmiConfig';
import { SessionProvider } from './lib/SessionContext';
import { App } from './App';
import './App.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </WagmiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
