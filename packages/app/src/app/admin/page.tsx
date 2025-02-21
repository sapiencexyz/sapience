/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminTable from '~/components/admin/AdminTable';
import { useToast } from '~/hooks/use-toast';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import type { RenderJob } from '~/lib/interfaces/interfaces';
import { foilApi } from '~/lib/utils/util';

const GET_RESOURCES = gql`
  query GetResources {
    resources {
      id
      slug
      name
    }
  }
`;

const Admin = () => {
  const [job, setJob] = useState<RenderJob | undefined>();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [statusOpen, setStatusOpen] = useState(false);
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualJobId, setManualJobId] = useState('');
  const [indexResourceOpen, setIndexResourceOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();

  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(GET_RESOURCES),
      });
      return data.resources;
    },
  });

  const handleGetStatus = async () => {
    const serviceId = manualServiceId || job?.serviceId;
    const jobId = manualJobId || job?.id;

    if (!serviceId || !jobId) return;

    setLoadingAction((prev) => ({ ...prev, getStatus: true }));
    const response = await foilApi.get(
      `/reindexStatus?jobId=${jobId}&serviceId=${serviceId}`
    );

    if (response.success && response.job) {
      setJob(response.job);
    }
    setLoadingAction((prev) => ({ ...prev, getStatus: false }));
  };

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

      const response = await foilApi.post(
        '/reindexMissingBlocks/index-resource',
        {
          slug: selectedResource,
          startTimestamp,
          ...(endTimestamp && { endTimestamp }),
          ...(signature && {
            signature,
            signatureTimestamp: timestamp,
          }),
        }
      );

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
        description: (e as Error)?.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoadingAction((prev) => ({ ...prev, indexResource: false }));
    }
  };

  return (
    <div className="w-full">
      <AdminTable />

      <div className="flex gap-4 my-4 ml-4">
        <Button onClick={() => setStatusOpen(true)}>Check Job Status</Button>
        <Button onClick={() => setIndexResourceOpen(true)}>
          Index Resource
        </Button>
      </div>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check Job Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Service ID</span>
                <Input
                  id="serviceId"
                  value={manualServiceId || job?.serviceId || ''}
                  onChange={(e) => setManualServiceId(e.target.value)}
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Job ID</span>
                <Input
                  id="jobId"
                  value={manualJobId || job?.id || ''}
                  onChange={(e) => setManualJobId(e.target.value)}
                />
              </label>
            </div>

            <Button
              onClick={handleGetStatus}
              disabled={
                (!manualServiceId && !job?.serviceId) ||
                (!manualJobId && !job?.id) ||
                loadingAction.getStatus
              }
              className="w-full"
            >
              {loadingAction.getStatus ? (
                <div className="animate-spin">⌛</div>
              ) : (
                'Submit'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    <SelectValue
                      placeholder={
                        resourcesLoading ? 'Loading...' : 'Select a resource'
                      }
                    />
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
    </div>
  );
};

export default Admin;
