import { useEffect } from 'react';
import { base } from 'viem/chains';
import { useAccount, useSwitchChain } from 'wagmi';

// NetworkSwitcher component to automatically switch to base chain
export default function NetworkSwitcher() {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    // Only attempt to switch if user is connected and not already on base
    if (isConnected && chainId && chainId !== base.id) {
      console.log(
        `Current chain: ${chainId}, switching to base chain: ${base.id}`
      );

      try {
        switchChain({ chainId: base.id });
      } catch (error) {
        console.warn('Failed to automatically switch to base chain:', error);
      }
    }
  }, [chainId, isConnected, switchChain]);

  return null; // This component doesn't render anything
}
