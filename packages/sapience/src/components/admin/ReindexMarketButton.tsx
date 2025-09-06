'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { useSettings } from '~/lib/context/SettingsContext';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-4 h-4" />,
});

interface ReindexMarketButtonProps {
  marketGroupAddress: string;
  chainId: number;
}

const ReindexMarketButton: React.FC<ReindexMarketButtonProps> = ({
  marketGroupAddress,
  chainId,
}) => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { adminBaseUrl, defaults } = useSettings();

  const handleReindex = async () => {
    setIsLoading(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      const base = adminBaseUrl ?? `${defaults.adminBaseUrl}`;
      const apiUrl = `${base}/reindex/market-events`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId: Number(chainId),
          address: marketGroupAddress, // API expects 'address'
          signature,
          timestamp,
          marketId: 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start reindex');
      }

      toast({
        title: 'Reindex Requested',
        description: `Reindexing started for market group ${marketGroupAddress.slice(
          0,
          6
        )}... on chain ${chainId}.`,
      });
    } catch (error) {
      console.error('Reindex market error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReindex}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <LottieLoader width={16} height={16} />
          <span className="ml-2">Reindexing...</span>
        </>
      ) : (
        'Reindex'
      )}
    </Button>
  );
};

export default ReindexMarketButton;
