/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import axios from 'axios';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AdminTable from '~/lib/components/admin/AdminTable';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { RenderJob } from '~/lib/interfaces/interfaces';

const Admin = () => {
  const [job, setJob] = useState<RenderJob | undefined>();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  const [statusOpen, setStatusOpen] = useState(false);
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualJobId, setManualJobId] = useState('');

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
    }
    setLoadingAction((prev) => ({ ...prev, getStatus: false }));
  };

  return (
    <div className="w-full">
      <AdminTable />

      <div className="flex gap-4 my-4 ml-4">
        <Button onClick={() => setStatusOpen(true)}>Check Job Status</Button>
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
    </div>
  );
};

export default Admin;
