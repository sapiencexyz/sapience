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

const ReindexPositionBalancesForm = () => {
  const [days, setDays] = useState('7');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson('/reindex/position-balances', {
        chainId: DEFAULT_CHAIN_ID,
        days: Number(days),
      });

      toast({
        title: 'Reindex job submitted',
        description: `Running in background for last ${days} day(s) on chain ${DEFAULT_CHAIN_ID}. Check API logs for progress.`,
      });
    } catch (error) {
      console.error('Position balance reindex error:', error);
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
        <label className="text-sm font-medium">Quick Ranges</label>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 7, 14].map((d) => (
            <Button
              key={d}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDays(d.toString())}
            >
              {d} day{d > 1 ? 's' : ''}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="reindexDays" className="text-sm font-medium">
          Days to reindex
        </label>
        <Input
          id="reindexDays"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="7"
          min="1"
        />
        <p className="text-sm text-muted-foreground">
          Replays missed Transfer events to fix Position balances. Uses binary
          search to find the starting block. Only processes events not already
          indexed.
        </p>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader className="w-3 h-3" />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Position Balances'
        )}
      </Button>
    </form>
  );
};

export default ReindexPositionBalancesForm;
