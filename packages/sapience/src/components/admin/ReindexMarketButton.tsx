'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAdminApi } from '~/hooks/useAdminApi';

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
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { postJson } = useAdminApi();

  const handleReindex = async () => {
    setIsLoading(true);
    try {
      await postJson(`/reindex/market-events`, {
        chainId: Number(chainId),
        address: marketGroupAddress,
        marketId: 0,
      });

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
