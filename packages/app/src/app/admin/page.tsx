/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import AdminTable from '~/components/admin/AdminTable';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { useResourcesAdmin } from '~/lib/hooks/useResources';
import { foilApi } from '~/lib/utils/util';

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Please try again.';

const Admin = () => {
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [indexResourceOpen, setIndexResourceOpen] = useState(false);
  const [refreshCacheOpen, setRefreshCacheOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState('');
  const [refreshResourceSlug, setRefreshResourceSlug] = useState('all');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const { data: resourcesData } = useResourcesAdmin();

  const handleIndexResource = async () => {
    try {
      setLoadingAction((prev) => ({ ...prev, indexResource: true }));
      const timestamp = Date.now();

      let signature = '';
      if (process.env.NODE_ENV === 'production') {
        signature = await signMessageAsync({
          message: ADMIN_AUTHENTICATE_MSG,
        });
      }

      const response = await foilApi.post('/reindex/resource', {
        slug: selectedResource,
        startTimestamp,
        ...(endTimestamp && { endTimestamp }),
        ...(signature && {
          signature,
          signatureTimestamp: timestamp,
        }),
      });

      if (response.success) {
        toast({
          title: 'Indexing started',
          description: 'Resource indexing has been initiated',
          variant: 'default',
        });
        setIndexResourceOpen(false);
      } else {
        toast({
          title: 'Indexing failed',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (e: Error | unknown) {
      console.error('Error in handleIndexResource:', e);
      toast({
        title: 'Indexing failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setLoadingAction((prev) => ({ ...prev, indexResource: false }));
    }
  };

  const handleRefreshCache = async () => {
    try {
      setLoadingAction((prev) => ({ ...prev, refreshCache: true }));
      const timestamp = Date.now();

      // Always request signature, matching the pattern in other admin functions
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      // Build the endpoint URL based on whether a specific resource is selected
      const endpoint =
        refreshResourceSlug && refreshResourceSlug !== 'all'
          ? `/cache/refresh-candle-cache/${refreshResourceSlug}?hardInitialize=true&signature=${signature}&signatureTimestamp=${timestamp}`
          : `/cache/refresh-candle-cache?hardInitialize=true&signature=${signature}&signatureTimestamp=${timestamp}`;

      const response = await foilApi.get(endpoint);

      if (response.success) {
        toast({
          title: 'Cache refreshed',
          description:
            refreshResourceSlug && refreshResourceSlug !== 'all'
              ? `Cache for ${refreshResourceSlug} has been successfully refreshed`
              : 'Cache has been successfully refreshed for all resources',
          variant: 'default',
        });
        setRefreshCacheOpen(false);
        setRefreshResourceSlug('all'); // Reset to "all" instead of empty string
      } else {
        toast({
          title: 'Cache refresh failed',
          description: response.error || DEFAULT_ERROR_MESSAGE,
          variant: 'destructive',
        });
      }
    } catch (e: Error | unknown) {
      console.error('Error in handleRefreshCache:', e);
      toast({
        title: 'Cache refresh failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setLoadingAction((prev) => ({ ...prev, refreshCache: false }));
    }
  };

  const toolButtons = (
    <>
      <Button size="xs" onClick={() => setIndexResourceOpen(true)}>
        Index Resource
      </Button>
      <Button size="xs" onClick={() => setRefreshCacheOpen(true)}>
        Refresh Cache
      </Button>
    </>
  );

  return (
    <div className="w-full h-full pb-20">
      <AdminTable toolButtons={toolButtons} />
      <Dialog open={indexResourceOpen} onOpenChange={setIndexResourceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Index Resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Resource</span>
                <Select
                  value={selectedResource}
                  onValueChange={setSelectedResource}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {resourcesData?.map(
                      (resource: { slug: string; name: string }) => (
                        <SelectItem key={resource.slug} value={resource.slug}>
                          {resource.name}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Start Timestamp</span>
                <Input
                  type="number"
                  value={startTimestamp}
                  onChange={(e) => setStartTimestamp(e.target.value)}
                  placeholder="Enter Unix timestamp"
                />
                <p className="text-sm text-muted-foreground mt-1">
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
              </label>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">
                  End Timestamp (Optional)
                </span>
                <Input
                  type="number"
                  value={endTimestamp}
                  onChange={(e) => setEndTimestamp(e.target.value)}
                  placeholder="Enter Unix timestamp"
                />
                <p className="text-sm text-muted-foreground mt-1">
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
              </label>
            </div>

            <Button
              onClick={handleIndexResource}
              disabled={
                !selectedResource ||
                !startTimestamp ||
                loadingAction.indexResource
              }
              className="w-full"
            >
              {loadingAction.indexResource ? (
                <div className="animate-spin">
                  <Loader2 className="w-4 h-4" />
                </div>
              ) : (
                'Submit'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={refreshCacheOpen} onOpenChange={setRefreshCacheOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Refresh Cache</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              This will trigger a hard initialization of the cache. This
              operation requires authentication.
            </p>

            <div className="space-y-2">
              <label className="block">
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
                    {resourcesData?.map(
                      (resource: { slug: string; name: string }) => (
                        <SelectItem key={resource.slug} value={resource.slug}>
                          {resource.name}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </label>
              <p className="text-xs text-muted-foreground">
                Select a specific resource to refresh, or leave empty to refresh
                all resources.
              </p>
            </div>

            <Button
              onClick={handleRefreshCache}
              disabled={loadingAction.refreshCache}
              className="w-full"
            >
              {loadingAction.refreshCache ? (
                <div className="animate-spin">
                  <Loader2 className="w-4 h-4" />
                </div>
              ) : (
                'Refresh Cache'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
