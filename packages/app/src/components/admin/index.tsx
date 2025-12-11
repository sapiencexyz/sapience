'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { Plus, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import RFQTab from './RFQTab';
import ConditionGroupsTab from './ConditionGroupsTab';
import ReindexPredictionMarketForm from './ReindexPredictionMarketForm';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useSettings } from '~/lib/context/SettingsContext';

// Dynamically import Loader
const Loader = dynamic(() => import('~/components/shared/Loader'), {
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
          Address (optional)
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
            <Loader size={12} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Accuracy Scores'
        )}
      </Button>
    </form>
  );
};

const Admin = () => {
  const [accuracyReindexOpen, setAccuracyReindexOpen] = useState(false);
  const [createConditionOpen, setCreateConditionOpen] = useState(false);
  const [rfqCsvImportOpen, setRfqCsvImportOpen] = useState(false);
  const [predictionMarketReindexOpen, setPredictionMarketReindexOpen] =
    useState(false);
  const { adminBaseUrl, setAdminBaseUrl, defaults } = useSettings();
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState(
    adminBaseUrl ?? defaults.adminBaseUrl
  );
  const [adminError, setAdminError] = useState<string | null>(null);

  // Condition Groups state
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupCsvImportOpen, setGroupCsvImportOpen] = useState(false);

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  return (
    <div className="container pt-6 mx-auto px-6 pb-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
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
          <Dialog
            open={predictionMarketReindexOpen}
            onOpenChange={setPredictionMarketReindexOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Reindex Prediction Markets
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Reindex Prediction Markets</DialogTitle>
              </DialogHeader>
              <ReindexPredictionMarketForm />
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

      <Tabs defaultValue="conditions" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="groups">Condition Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="conditions">
          <RFQTab
            createOpen={createConditionOpen}
            setCreateOpen={setCreateConditionOpen}
            csvImportOpen={rfqCsvImportOpen}
            onCsvImportOpenChange={setRfqCsvImportOpen}
            actionButtons={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRfqCsvImportOpen(true)}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Import CSV
                </Button>
                <Button size="sm" onClick={() => setCreateConditionOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Condition
                </Button>
              </>
            }
          />
        </TabsContent>

        <TabsContent value="groups">
          <ConditionGroupsTab
            createOpen={createGroupOpen}
            setCreateOpen={setCreateGroupOpen}
            csvImportOpen={groupCsvImportOpen}
            onCsvImportOpenChange={setGroupCsvImportOpen}
            actionButtons={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupCsvImportOpen(true)}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Import CSV
                </Button>
                <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Group
                </Button>
              </>
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
