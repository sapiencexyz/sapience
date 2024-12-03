/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import axios from 'axios';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { signMessageAsync } = useSignMessage();

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
    if (!job) return;
    setLoadingAction((prev) => ({ ...prev, getStatus: true }));
    const response = await axios.get(
      `${API_BASE_URL}/reindexStatus?jobId=${job.id}&serviceId=${job.serviceId}`
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto pb-8">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Reindex Market</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Check Job Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Service ID</span>
                <Input id="serviceId" value={job?.serviceId || ''} readOnly />
              </label>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-medium">Job ID</span>
                <Input id="jobId" value={job?.id || ''} readOnly />
              </label>
            </div>

            <Button
              onClick={handleGetStatus}
              disabled={!job || loadingAction.getStatus}
              className="w-full"
            >
              {loadingAction.getStatus ? (
                <div className="animate-spin">⌛</div>
              ) : (
                'Submit'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
