'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Checkbox } from '@sapience/ui/components/ui/checkbox';
import { useToast } from '@sapience/ui/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAdminApi } from '~/hooks/useAdminApi';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-4 h-4" />,
});

const ReindexPredictionMarketForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [chainId, setChainId] = useState('42161'); // Default to Arbitrum
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const [clearExisting, setClearExisting] = useState(false);
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson(`/reindex/prediction-market`, {
        chainId: Number(chainId),
        ...(startTimestamp && { startTimestamp: Number(startTimestamp) }),
        ...(endTimestamp && { endTimestamp: Number(endTimestamp) }),
        clearExisting,
      });

      const timeRange = startTimestamp
        ? `from ${new Date(Number(startTimestamp) * 1000).toLocaleDateString()}`
        : 'last 2 days (default)';

      toast({
        title: 'Reindex started',
        description: `Prediction market reindexing started on chain ${chainId} ${timeRange}${clearExisting ? ' (clearing existing data)' : ''}`,
      });

      // Reset form
      setStartTimestamp('');
      setEndTimestamp('');
      setClearExisting(false);
    } catch (error) {
      console.error('Reindex prediction market error:', error);
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

  // Helper function to set common time ranges
  const setTimeRange = (hours: number) => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - hours * 60 * 60;
    setStartTimestamp(start.toString());
    setEndTimestamp('');
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="chainSelect" className="text-sm font-medium">
          Chain
        </label>
        <Select value={chainId} onValueChange={setChainId}>
          <SelectTrigger id="chainSelect" className="w-full">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Ethereum</SelectItem>
            <SelectItem value="10">Optimism</SelectItem>
            <SelectItem value="8453">Base</SelectItem>
            <SelectItem value="42161">Arbitrum</SelectItem>
            <SelectItem value="137">Polygon</SelectItem>
            <SelectItem value="432">Converge</SelectItem>
          </SelectContent>
        </Select>
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

      <div className="flex items-center space-x-2">
        <Checkbox
          id="clearExisting"
          checked={clearExisting}
          onCheckedChange={(checked) => setClearExisting(checked as boolean)}
        />
        <label
          htmlFor="clearExisting"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Clear existing data before reindexing
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        ⚠️ Warning: This will delete all existing parlays and events for the
        selected chain before reindexing.
      </p>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <LottieLoader width={16} height={16} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Prediction Markets'
        )}
      </Button>
    </form>
  );
};

export default ReindexPredictionMarketForm;
