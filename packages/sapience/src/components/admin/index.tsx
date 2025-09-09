'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useResources } from '@sapience/ui/hooks/useResources';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import columns from './columns';
import { DEFAULT_FACTORY_ADDRESS } from './CreateMarketGroupForm';
import DataTable from './data-table';
import RFQTab from './RFQTab';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useSettings } from '~/lib/context/SettingsContext';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
//

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Please try again.';

const ReindexAccuracyForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [marketId, setMarketId] = useState('');
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson(`/reindex/accuracy`, {
        ...(address && { address }),
        ...(marketId && { marketId }),
      });

      toast({
        title: 'Reindex started',
        description: address
          ? `Accuracy score reindex started for ${address}${marketId ? `, market ${marketId}` : ''}`
          : 'Global accuracy score backfill started',
      });

      setAddress('');
      setMarketId('');
    } catch (error) {
      console.error('Reindex accuracy error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="accuracyAddress" className="text-sm font-medium">
          Market Group Address (optional)
        </label>
        <Input
          id="accuracyAddress"
          placeholder="0x... (leave blank for global backfill)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="accuracyMarketId" className="text-sm font-medium">
          Market ID (optional)
        </label>
        <Input
          id="accuracyMarketId"
          placeholder="e.g. 123 (scoped to address if provided)"
          value={marketId}
          onChange={(e) => setMarketId(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <LottieLoader width={16} height={16} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Accuracy Scores'
        )}
      </Button>
    </form>
  );
};

const ReindexFactoryForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [factoryAddress, setFactoryAddress] = useState(DEFAULT_FACTORY_ADDRESS);
  const [chainId, setChainId] = useState('42161'); // Default to Arbitrum
  const { postJson: postJson2 } = useAdminApi();

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

      // Construct the API URL from settings admin base
      await postJson2(`/reindex/market-group-factory`, {
        chainId: Number(chainId),
        factoryAddress,
      });

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

const IndexResourceForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [selectedResource, setSelectedResource] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const { postJson: postJson3 } = useAdminApi();

  const handleIndexResource = async () => {
    try {
      setIsLoading(true);
      const response = await postJson3<{ success: boolean; error?: string }>(
        `/reindex/resource`,
        {
          slug: selectedResource,
          startTimestamp,
          ...(endTimestamp && { endTimestamp }),
        }
      );
      if (response.success) {
        toast({
          title: 'Indexing complete',
          description: 'Resource has been reindexed successfully',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Indexing failed',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleIndexResource:', e);
      toast({
        title: 'Indexing failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium">Resource</span>
        <Select value={selectedResource} onValueChange={setSelectedResource}>
          <SelectTrigger>
            <SelectValue placeholder="Select a resource" />
          </SelectTrigger>
          <SelectContent>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Start Timestamp</span>
        <Input
          type="number"
          value={startTimestamp}
          onChange={(e) => setStartTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
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
          , 10 digits
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">End Timestamp (Optional)</span>
        <Input
          type="number"
          value={endTimestamp}
          onChange={(e) => setEndTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
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
          , 10 digits
        </p>
      </div>

      <Button
        onClick={handleIndexResource}
        disabled={!selectedResource || !startTimestamp || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Submit'
        )}
      </Button>
    </div>
  );
};

const RefreshCacheForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [refreshResourceSlug, setRefreshResourceSlug] = useState('all');
  const { getJson } = useAdminApi();

  const handleRefreshCache = async () => {
    try {
      setIsLoading(true);
      const response = await (refreshResourceSlug &&
      refreshResourceSlug !== 'all'
        ? getJson<{ success: boolean; message?: string; error?: string }>(
            `/cache/refresh-candle-cache/${refreshResourceSlug}`
          )
        : getJson<{ success: boolean; message?: string; error?: string }>(
            `/cache/refresh-candle-cache`
          ));

      if (response && response.success) {
        toast({
          title: 'Cache refreshed',
          description:
            refreshResourceSlug && refreshResourceSlug !== 'all'
              ? `Cache for ${refreshResourceSlug} has been successfully refreshed`
              : 'Cache has been successfully refreshed for all resources',
          variant: 'default',
        });
        setRefreshResourceSlug('all'); // Reset to "all" instead of empty string
      } else {
        toast({
          title: 'Cache refresh failed',
          description: response.error || DEFAULT_ERROR_MESSAGE,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleRefreshCache:', e);
      toast({
        title: 'Cache refresh failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        This will trigger a hard initialization of the cache. This operation
        requires authentication.
      </p>

      <div className="space-y-2">
        <span className="text-sm font-medium">Resource (Optional)</span>
        <Select
          value={refreshResourceSlug}
          onValueChange={setRefreshResourceSlug}
        >
          <SelectTrigger>
            <SelectValue placeholder="All resources (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a specific resource to refresh, or leave empty to refresh all
          resources.
        </p>
      </div>

      <Button
        onClick={handleRefreshCache}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Refresh Cache'
        )}
      </Button>
    </div>
  );
};

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false);
  const [indexResourceOpen, setIndexResourceOpen] = useState(false);
  const [refreshCacheOpen, setRefreshCacheOpen] = useState(false);
  const [accuracyReindexOpen, setAccuracyReindexOpen] = useState(false);
  const [createConditionOpen, setCreateConditionOpen] = useState(false);
  const { adminBaseUrl, setAdminBaseUrl, defaults } = useSettings();
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState(
    adminBaseUrl ?? defaults.adminBaseUrl
  );
  const [adminError, setAdminError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'liquid' | 'rfq'>('liquid');

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

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
          <Dialog open={indexResourceOpen} onOpenChange={setIndexResourceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Index Resource
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Index Resource</DialogTitle>
              </DialogHeader>
              <IndexResourceForm />
            </DialogContent>
          </Dialog>
          <Dialog
            open={accuracyReindexOpen}
            onOpenChange={setAccuracyReindexOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Reindex Accuracy Scores
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Reindex Accuracy Scores</DialogTitle>
              </DialogHeader>
              <ReindexAccuracyForm />
            </DialogContent>
          </Dialog>
          <Dialog open={refreshCacheOpen} onOpenChange={setRefreshCacheOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Refresh Cache
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Refresh Cache</DialogTitle>
              </DialogHeader>
              <RefreshCacheForm />
            </DialogContent>
          </Dialog>
          <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Endpoint Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Endpoint Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <label htmlFor="admin-endpoint" className="text-sm font-medium">
                  Base URL
                </label>
                <Input
                  id="admin-endpoint"
                  value={adminDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAdminDraft(v);
                    setAdminError(
                      v && !isHttpUrl(v)
                        ? 'Must be an absolute http(s) base URL'
                        : null
                    );
                  }}
                  onBlur={() => {
                    if (!adminDraft) {
                      setAdminBaseUrl(null);
                      setAdminDraft(defaults.adminBaseUrl);
                      setAdminError(null);
                      return;
                    }
                    if (isHttpUrl(adminDraft)) {
                      const normalized =
                        adminDraft.endsWith('/') && adminDraft !== '/'
                          ? adminDraft.slice(0, -1)
                          : adminDraft;
                      setAdminDraft(normalized);
                      setAdminBaseUrl(normalized);
                      setAdminError(null);
                    } else {
                      setAdminError('Must be an absolute http(s) base URL');
                    }
                  }}
                />
                {adminError ? (
                  <p className="text-xs text-red-500">{adminError}</p>
                ) : null}
                <div className="flex gap-2 justify-end">
                  {adminDraft !== defaults.adminBaseUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdminBaseUrl(null);
                        setAdminDraft(defaults.adminBaseUrl);
                        setAdminError(null);
                      }}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAdminDialogOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'liquid' | 'rfq')}
        className="w-full"
      >
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger value="liquid">
              Concentrated Liquidity Markets
            </TabsTrigger>
            <TabsTrigger value="rfq">Batch Auction Settlement</TabsTrigger>
          </TabsList>
          {activeTab === 'liquid' ? (
            <div className="md:ml-auto flex items-center gap-2">
              <Button size="sm" asChild>
                <a href="/admin/create">
                  <Plus className="mr-1 h-4 w-4" />
                  New Market Group
                </a>
              </Button>
              <Dialog
                open={reindexDialogOpen}
                onOpenChange={setReindexDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
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
          ) : activeTab === 'rfq' ? (
            <div className="md:ml-auto flex items-center gap-2">
              <Button size="sm" onClick={() => setCreateConditionOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                New Condition
              </Button>
            </div>
          ) : null}
        </div>
        <TabsContent value="liquid">
          <div>
            {isLoading && (
              <div className="flex justify-center items-center py-8">
                <LottieLoader width={32} height={32} />
              </div>
            )}
            {error && (
              <p className="text-red-500">
                Error loading markets: {error.message}
              </p>
            )}
            {sortedMarketGroups && sortedMarketGroups.length > 0 ? (
              <>
                <DataTable columns={columns} data={sortedMarketGroups} />
              </>
            ) : (
              !isLoading && <p>No active market groups found.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="rfq">
          <RFQTab
            createOpen={createConditionOpen}
            setCreateOpen={setCreateConditionOpen}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
