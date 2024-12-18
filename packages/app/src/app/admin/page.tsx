/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import axios from 'axios';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '~/hooks/use-toast';
import MarketsTable from '~/lib/components/MarketsTable';
import {
  ADMIN_AUTHENTICATE_MSG,
  API_BASE_URL,
} from '~/lib/constants/constants';
import type { RenderJob } from '~/lib/interfaces/interfaces';

const JobStatus = ({
  job,
  lastRefresh,
}: {
  job: RenderJob;
  lastRefresh: string;
}) => {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Job Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(job).map(([key, value]) => (
            <div className="flex justify-between" key={key}>
              <p className="font-medium">{key}:</p>
              <p>{value}</p>
            </div>
          ))}
          <div className="flex justify-between text-sm text-muted-foreground">
            <p>Last Refresh:</p>
            <p>{lastRefresh}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Admin = () => {
  const [chainId, setChainId] = useState('');
  const [address, setAddress] = useState('');
  const [job, setJob] = useState<RenderJob | undefined>();
  const [lastRefresh, setLastRefresh] = useState('');
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [reindexOpen, setReindexOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const { signMessageAsync } = useSignMessage();
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualJobId, setManualJobId] = useState('');

  const handleReindex = async () => {
    try {
      setLoadingAction((prev) => ({ ...prev, reindex: true }));
      const timestamp = Date.now();

      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });
      const response = await axios.get(
        `${API_BASE_URL}/reindex?chainId=${chainId}&address=${address}&signature=${signature}&timestamp=${timestamp}`
      );
      if (response.data.success && response.data.job) {
        setJob(response.data.job);
      } else {
        setJob(undefined);
        toast({
          title: 'Failed to get position from uniswap',
          description: `Unable to reindex: ${response.data.error}`,
          variant: 'destructive',
        });
      }
      setLoadingAction((prev) => ({ ...prev, reindex: false }));
    } catch (e: any) {
      console.error('error:', e);
      setJob(undefined);
      toast({
        title: 'Failed to get position from uniswap',
        description: `Unable to reindex: ${e?.response?.data?.error}`,
        variant: 'destructive',
      });
      setLoadingAction((prev) => ({ ...prev, reindex: false }));
    }
  };

  const handleGetStatus = async () => {
    const serviceId = manualServiceId || job?.serviceId;
    const jobId = manualJobId || job?.id;

    if (!serviceId || !jobId) return;

    setLoadingAction((prev) => ({ ...prev, getStatus: true }));
    const response = await axios.get(
      `${API_BASE_URL}/reindexStatus?jobId=${jobId}&serviceId=${serviceId}`
    );

    if (response.data.success && response.data.job) {
      setJob(response.data.job);
      setLastRefresh(new Date().toISOString());
    }
    setLoadingAction((prev) => ({ ...prev, getStatus: false }));
  };

  return (
    <div className="w-full">
      <MarketsTable />

      <div className="flex gap-4 my-4 ml-4">
        <Button onClick={() => setReindexOpen(true)}>Reindex Market</Button>
        <Button onClick={() => setStatusOpen(true)}>Check Job Status</Button>
      </div>

      <Dialog open={reindexOpen} onOpenChange={setReindexOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reindex Market</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Market Address</span>
                <Input
                  id="marketAddress"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Chain ID</span>
                <Input
                  id="chainId"
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                />
              </label>
            </div>

            <Button
              onClick={handleReindex}
              disabled={loadingAction.reindex}
              className="w-full"
            >
              {loadingAction.reindex ? (
                <div className="animate-spin">⌛</div>
              ) : (
                'Submit'
              )}
            </Button>

            {job ? <JobStatus job={job} lastRefresh={lastRefresh} /> : null}
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
};

export default Admin;
