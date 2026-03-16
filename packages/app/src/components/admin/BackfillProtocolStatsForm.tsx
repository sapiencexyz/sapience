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

const BackfillProtocolStatsForm = () => {
  const [days, setDays] = useState('90');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson('/reindex/protocol-stats', {
        days: Number(days),
        chainId: DEFAULT_CHAIN_ID,
      });

      toast({
        title: 'Backfill job submitted',
        description: `Running in background for ${days} days on chain ${DEFAULT_CHAIN_ID}. Check API logs for progress.`,
      });
    } catch (error) {
      console.error('Protocol stats backfill error:', error);
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

  const setQuickDays = (numDays: number) => {
    setDays(numDays.toString());
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDays(7)}
          >
            7 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDays(30)}
          >
            30 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickDays(90)}
          >
            90 days
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="days" className="text-sm font-medium">
          Days to backfill
        </label>
        <Input
          id="days"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="90"
          min="1"
          max="365"
        />
        <p className="text-sm text-muted-foreground">
          Number of days to backfill historical stats data (default: 90).
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        This will query on-chain state at historical blocks and store daily
        snapshots. Requires archive node support.
      </p>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader className="w-3 h-3" />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Backfill Protocol Stats'
        )}
      </Button>
    </form>
  );
};

export default BackfillProtocolStatsForm;
