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
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Copy, ListOrdered, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { Address } from 'viem';

import ReferralCodesTab from './ReferralCodesTab';
import BackfillProtocolStatsForm from './BackfillProtocolStatsForm';
import { getSmartAccountAddress } from '~/lib/session/sessionKeyManager';
import { useSettings } from '~/lib/context/SettingsContext';

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Please try again.';

const Admin = () => {
  const { toast } = useToast();
  const { adminBaseUrl, setAdminBaseUrl, defaults } = useSettings();
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState(
    adminBaseUrl ?? defaults.adminBaseUrl
  );
  const [adminError, setAdminError] = useState<string | null>(null);

  const [createReferralCodeOpen, setCreateReferralCodeOpen] = useState(false);

  // Smart Account Lookup state
  const [smartAccountLookupOpen, setSmartAccountLookupOpen] = useState(false);
  const [eoaInput, setEoaInput] = useState('');
  const [smartAccountResult, setSmartAccountResult] = useState('');

  const handleSmartAccountLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = eoaInput.trim();
    if (!trimmed) return;
    try {
      setSmartAccountResult(getSmartAccountAddress(trimmed as Address));
    } catch (error) {
      console.error('Smart account lookup error:', error);
      toast({
        variant: 'destructive',
        title: 'Lookup failed',
        description:
          error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
      });
    }
  };

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
        <h1 className="text-3xl">Admin</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/question-ordering">
            <Button variant="outline" size="sm">
              <ListOrdered className="mr-1 h-4 w-4" />
              Question Ordering
            </Button>
          </Link>
          <Dialog
            open={smartAccountLookupOpen}
            onOpenChange={(open) => {
              setSmartAccountLookupOpen(open);
              if (!open) {
                setEoaInput('');
                setSmartAccountResult('');
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Smart Account Lookup
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Smart Account Lookup</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSmartAccountLookup} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="eoaAddress" className="text-sm font-medium">
                    EOA Address
                  </label>
                  <Input
                    id="eoaAddress"
                    placeholder="0x..."
                    value={eoaInput}
                    onChange={(e) => setEoaInput(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={!eoaInput.trim()}>
                  Lookup
                </Button>
                {smartAccountResult && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Smart Account Address
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={smartAccountResult}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(smartAccountResult);
                          toast({ title: 'Copied to clipboard' });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Endpoint settings"
              >
                <Settings className="h-4 w-4" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border p-4">
            <h2 className="text-lg font-medium mb-4">
              Backfill Protocol Stats
            </h2>
            <BackfillProtocolStatsForm />
          </div>
        </aside>
        <section className="lg:col-span-2">
          <ReferralCodesTab
            createOpen={createReferralCodeOpen}
            setCreateOpen={setCreateReferralCodeOpen}
            actionButtons={
              <Button size="sm" onClick={() => setCreateReferralCodeOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                New Referral Code
              </Button>
            }
          />
        </section>
      </div>
    </div>
  );
};

export default Admin;
