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

const ReindexConditionSettledForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson(`/reindex/condition-settled`, {
        chainId: DEFAULT_CHAIN_ID,
        ...(startTimestamp && { startTimestamp: Number(startTimestamp) }),
        ...(endTimestamp && { endTimestamp: Number(endTimestamp) }),
      });

      toast({
        title: 'Reindex job submitted',
        description: `Running in background on chain ${DEFAULT_CHAIN_ID}. Check API logs for progress.`,
      });

      setStartTimestamp('');
      setEndTimestamp('');
    } catch (error) {
      console.error('Reindex condition settled error:', error);
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

  const setTimeRange = (hours: number) => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - hours * 60 * 60;
    setStartTimestamp(start.toString());
    setEndTimestamp('');
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
        <label className="text-sm font-medium">Quick Time Ranges</label>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTimeRange(4)}
          >
            Last 4 hours
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTimeRange(16)}
          >
            Last 16 hours
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTimeRange(48)}
          >
            Last 2 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTimeRange(7 * 24)}
          >
            Last week
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="startTimestamp" className="text-sm font-medium">
          Start Timestamp (optional)
        </label>
        <Input
          id="startTimestamp"
          type="number"
          placeholder="Leave blank for default (2 days ago)"
          value={startTimestamp}
          onChange={(e) => setStartTimestamp(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://www.unixtimestamp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Unix seconds
          </a>
          , 10 digits. Leave blank to use default (2 days ago).
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="endTimestamp" className="text-sm font-medium">
          End Timestamp (optional)
        </label>
        <Input
          id="endTimestamp"
          type="number"
          placeholder="Leave blank for now"
          value={endTimestamp}
          onChange={(e) => setEndTimestamp(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Leave blank to index up to the current time.
        </p>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader className="w-3 h-3" />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Prediction Markets'
        )}
      </Button>
    </form>
  );
};

export default ReindexConditionSettledForm;
