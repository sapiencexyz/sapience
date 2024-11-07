'use client';

import axios from 'axios';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import MarketsTable from '~/lib/components/MarketsTable';
import { API_BASE_URL } from '~/lib/constants/constants';
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

  const handleReindex = async () => {
    setLoadingAction((prev) => ({ ...prev, reindex: true }));
    const response = await axios.get(
      `${API_BASE_URL}/reindex?chainId=${chainId}&address=${address}`
    );
    if (response.data.success && response.data.job) {
      setJob(response.data.job);
    } else {
      setJob(undefined);
    }
    setLoadingAction((prev) => ({ ...prev, reindex: false }));
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
    <div className="w-full my-10 space-y-8">
      <MarketsTable />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Reindex Market</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Market Address</p>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Chain ID</p>
              <Input
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
              />
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
              <p className="text-sm font-medium">Service ID</p>
              <Input value={job?.serviceId || ''} readOnly />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Job ID</p>
              <Input value={job?.id || ''} readOnly />
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
