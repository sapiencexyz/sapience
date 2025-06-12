'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import { Input } from '@foil/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@foil/ui/components/ui/select';
import { useToast } from '@foil/ui/hooks/use-toast';
import { Plus, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

import columns from './columns';
import CombinedMarketDialog from './CombinedMarketDialog';
import DataTable from './data-table';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const ReindexFactoryForm = () => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [factoryAddress, setFactoryAddress] = useState(
    '0xA61BF5F56a6a035408d5d76EbE58F8204891FB40'
  );
  const [chainId, setChainId] = useState('8453'); // Default to Base

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!factoryAddress.startsWith('0x')) {
      toast({
        variant: 'destructive',
        title: 'Invalid address',
        description: 'Factory address must start with 0x',
      });
      return;
    }

    try {
      setIsLoading(true);

      // Generate timestamp and signature
      const timestamp = Date.now(); // Use Date.now() for consistency
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG, // Use standard auth message
      });

      // Construct the API URL from environment variable
      const apiUrl = `${process.env.NEXT_PUBLIC_FOIL_API_URL || ''}/reindex/market-group-factory`;

      // Call the API endpoint
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId: Number(chainId),
          factoryAddress,
          signature,
          timestamp, // Send the timestamp used for validation
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reindex factory');
      }

      toast({
        title: 'Reindex started',
        description: 'The market group factory reindexing process has started.',
      });

      // Reset form
      setFactoryAddress('');
    } catch (error) {
      console.error('Reindex factory error:', error);
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
      <div className="space-y-2">
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label htmlFor="factoryAddress" className="text-sm font-medium">
          Factory Address
        </label>
        <Input
          id="factoryAddress"
          placeholder="0x..."
          value={factoryAddress}
          onChange={(e) => setFactoryAddress(e.target.value)}
        />
        {factoryAddress && !factoryAddress.startsWith('0x') && (
          <p className="text-sm text-red-500">Address must start with 0x</p>
        )}
      </div>

      <div className="space-y-2">
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <LottieLoader width={16} height={16} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Factory'
        )}
      </Button>
    </form>
  );
};

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false);

  // Sort market groups with most recent (highest ID) first
  const sortedMarketGroups = marketGroups
    ? [...marketGroups].sort((a, b) => {
        // Sort by id descending (most recent first)
        return Number(b.id) - Number(a.id);
      })
    : [];

  return (
    <div className="container pt-24 mx-auto px-6 pb-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                New Market Group
              </Button>
            </DialogTrigger>
            <DialogContent className="overflow-hidden">
              <DialogHeader>
                <DialogTitle>Launch New Market Group with Markets</DialogTitle>
              </DialogHeader>
              <CombinedMarketDialog onClose={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={reindexDialogOpen} onOpenChange={setReindexDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <RefreshCw className="mr-1 h-4 w-4" />
                Reindex Factory
              </Button>
            </DialogTrigger>
            <DialogContent className="overflow-hidden max-w-md">
              <DialogHeader>
                <DialogTitle>Reindex Market Group Factory</DialogTitle>
              </DialogHeader>
              <ReindexFactoryForm />
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div>
        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <LottieLoader width={32} height={32} />
          </div>
        )}
        {error && (
          <p className="text-red-500">Error loading markets: {error.message}</p>
        )}
        {sortedMarketGroups && sortedMarketGroups.length > 0 ? (
          <DataTable columns={columns} data={sortedMarketGroups} />
        ) : (
          !isLoading && <p>No active market groups found.</p>
        )}
      </div>
    </div>
  );
};

export default Admin;
