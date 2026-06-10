import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { wagmiConfig } from './lib/wagmi';
import { SessionProvider } from './hooks/useSession';
import './index.css';

// Capture ?ref=<address> referral links before the app renders. The address
// is sent with the card submission; referral payouts are made off-chain.
const refParam = new URLSearchParams(window.location.search).get('ref');
if (refParam && /^0x[a-fA-F0-9]{40}$/.test(refParam)) {
  window.localStorage.setItem('bingo-ref', refParam);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
