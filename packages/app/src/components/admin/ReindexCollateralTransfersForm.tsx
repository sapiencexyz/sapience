'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAdminApi } from '~/hooks/useAdminApi';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  loading: () => <div className="w-4 h-4" />,
});

const ReindexCollateralTransfersForm = () => {
  const [fromBlock, setFromBlock] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson('/reindex/collateral-transfers', {
        chainId: DEFAULT_CHAIN_ID,
        ...(fromBlock && { fromBlock: Number(fromBlock) }),
      });

      toast({
        title: 'Reindex job submitted',
        description: `Running in background${fromBlock ? ` from block ${fromBlock}` : ' from token creation'} on chain ${DEFAULT_CHAIN_ID}. Check API logs for progress.`,
      });
    } catch (error) {
      console.error('Collateral transfer reindex error:', error);
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">Chain</div>
        <div className="text-sm text-muted-foreground">
          Ethereal ({DEFAULT_CHAIN_ID})
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="collateralFromBlock" className="text-sm font-medium">
          From Block (optional)
        </label>
        <Input
          id="collateralFromBlock"
          type="number"
          value={fromBlock}
          onChange={(e) => setFromBlock(e.target.value)}
          placeholder="Leave blank to start from token creation"
          min="0"
        />
        <p className="text-sm text-muted-foreground">
          Replays wUSDe Transfer events to fix collateral balances. Uses
          skipDuplicates so already-indexed events are skipped.
        </p>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader className="w-3 h-3" />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Collateral Transfers'
        )}
      </Button>
    </form>
  );
};

export default ReindexCollateralTransfersForm;
