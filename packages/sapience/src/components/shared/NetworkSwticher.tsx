'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';

// Chain constants
const BASE_CHAIN_ID = 8453;
const CONVERGE_CHAIN_ID = 432;

export function NetworkSwitcher() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const { toast } = useToast();

  useEffect(() => {
    // Only run if wallet is connected and not currently switching
    if (!isConnected || isPending) {
      return;
    }

    // Determine expected network based on current page
    const isOnForecastingPage = pathname.startsWith('/forecast');
    const isOnMarketPages = pathname.startsWith('/markets') || pathname.startsWith('/market');
    
    // Only switch on relevant pages
    if (!isOnForecastingPage && !isOnMarketPages) {
      return;
    }

    const expectedChainId = isOnForecastingPage ? CONVERGE_CHAIN_ID : BASE_CHAIN_ID;
    const expectedNetworkName = isOnForecastingPage ? 'Converge' : 'Base';
    
    // If already on correct network, do nothing
    if (currentChainId === expectedChainId) {
      return;
    }

    // Auto-switch to the expected network
    if (switchChain) {
      switchChain(
        { chainId: expectedChainId },
        {
          onSuccess: () => {
            toast({
              title: 'Network Switched',
              description: `Automatically switched to ${expectedNetworkName} network`,
              duration: 3000,
            });
          },
          onError: (error) => {
            // Only show error if it's not a user rejection
            if (!error.message.includes('User rejected the request')) {
              toast({
                title: 'Network Switch Failed',
                description: `Failed to switch to ${expectedNetworkName} network. Please switch manually in your wallet.`,
                variant: 'destructive',
                duration: 5000,
              });
            }
          },
        }
      );
    }
  }, [pathname, isConnected, currentChainId, switchChain, isPending, toast]);

  // This component doesn't render anything
  return null;
} 