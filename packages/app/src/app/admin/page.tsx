'use client';

import axios from 'axios';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MarketsTable from '~/lib/components/MarketsTable';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { RenderJob } from '~/lib/interfaces/interfaces';

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
    console.log('response', response);
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
    console.log('status response', response);

    if (response.data.success && response.data.job) {
      setJob(response.data.job);
      setLastRefresh(new Date().toISOString());
    }

    console.log('response', response);
    setLoadingAction((prev) => ({ ...prev, getStatus: false }));
  };

  const renderJob = () => {
    if (!job) return;
    return (
      <div className="my-4">
        <p className="font-bold text-lg">Job Status:</p>
        {Object.entries(job).map(([key, value]) => (
          <div className="flex justify-between" key={key}>
            <p className="mr-2 font-bold">{key}:</p>
            <p>{value}</p>
          </div>
        ))}
        <p>Last Refresh: {lastRefresh}</p>
      </div>
    );
  };

  return (
    <div className="container my-10 min-w-[90vw] mx-10">
      <MarketsTable />
      <div className="max-w-[800px] mx-auto mt-10">
        <p className="text-xl my-8 font-bold">Reindex</p>
        <div className="mb-4">
          <p>Enter Market Address</p>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="mb-4">
          <p>Enter Chain ID</p>
          <Input value={chainId} onChange={(e) => setChainId(e.target.value)} />
        </div>
        <Button onClick={handleReindex} disabled={loadingAction.reindex}>
          {loadingAction.reindex ? (
            <div className="animate-spin">⌛</div>
          ) : (
            'Submit'
          )}
        </Button>
        <div className="mt-8">
          {renderJob()}
          <div className="mb-4">
            <p>Service Id:</p>
            <Input value={job?.serviceId || ''} readOnly />
          </div>
          <div className="mb-4">
            <p>JobId:</p>
            <Input value={job?.id || ''} readOnly />
          </div>
          <Button
            onClick={handleGetStatus}
            disabled={!job || loadingAction.getStatus}
          >
            {loadingAction.getStatus ? (
              <div className="animate-spin">⌛</div>
            ) : (
              'refresh job status'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
