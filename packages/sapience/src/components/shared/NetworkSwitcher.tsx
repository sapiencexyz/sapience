'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { base } from 'viem/chains';

// Chain constants
const CONVERGE_CHAIN_ID = 432;

export function NetworkSwitcher() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const { toast } = useToast();

  useEffect(() => {
    
    if (!isConnected || isPending) {
      return;
    }

   
    const isOnForecastingPage = pathname.startsWith('/forecast');
    const isOnMarketPages = pathname.startsWith('/markets') || pathname.startsWith('/market');
    
   
    if (!isOnForecastingPage && !isOnMarketPages) {
      return;
    }

    const expectedChainId = isOnForecastingPage ? CONVERGE_CHAIN_ID : base.id;
    const expectedNetworkName = isOnForecastingPage ? 'Converge' : base.name;
    
   
    if (currentChainId === expectedChainId) {
      return;
    }

  
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

 
  return null;
} 