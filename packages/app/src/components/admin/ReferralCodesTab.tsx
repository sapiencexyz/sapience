'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Badge } from '@sapience/ui/components/ui/badge';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Copy, BarChart3, Pencil, Trash2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { formatDistanceToNow, fromUnixTime, format } from 'date-fns';
import DataTable from './data-table';
import { useAdminApi } from '~/hooks/useAdminApi';

type ReferralCodeRow = {
  id: number;
  code: string | null; // May be null for user-created codes
  codeHash: string;
  description: string | null;
  maxClaims: number;
  isActive: boolean;
  expiresAt: number | null;
  createdBy: string;
  creatorType: 'admin' | 'user';
  createdAt: string;
  claimCount: number;
  // Required by DataTable generic constraint
  category?: { slug?: string };
};

type AnalyticsData = {
  code: string | null;
  codeHash: string;
  claimCount: number;
  claimants: Array<{
    address: string;
    tradingVolume: string;
    positionCount: number;
  }>;
  totalVolume: string;
  totalPositions: number;
};

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

type ReferralCodesTabProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  actionButtons?: React.ReactNode;
};

const ReferralCodesTab = ({
  createOpen,
  setCreateOpen,
  actionButtons,
}: ReferralCodesTabProps) => {
  const { toast } = useToast();
  const adminApi = useAdminApi();
  const { address: connectedAddress } = useAccount();

  // The referral admin endpoints are at /referrals/admin/... (not /admin/referrals/...)
  // So we need to use the API root URL, not the admin base URL
  const apiBaseUrl = adminApi.base.replace(/\/admin$/, '');

  // Use refs to avoid infinite loops with useEffect
  const adminApiRef = useRef(adminApi);
  adminApiRef.current = adminApi;
  const apiBaseUrlRef = useRef(apiBaseUrl);
  apiBaseUrlRef.current = apiBaseUrl;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Custom fetch functions for referral endpoints (which are at /referrals/admin/...)
  const referralFetch = useCallback(
    async <T,>(
      path: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      body?: Record<string, unknown>
    ): Promise<T> => {
      const { signature, signatureTimestamp } = await adminApiRef.current.sign();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'x-admin-signature': signature,
        'x-admin-signature-timestamp': String(signatureTimestamp),
      };

      const response = await fetch(`${apiBaseUrlRef.current}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Request failed');
      }
      return data as T;
    },
    []
  );

  // Data state
  const [codes, setCodes] = useState<ReferralCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Form state
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [maxClaims, setMaxClaims] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);

  // Analytics dialog state
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | undefined>(undefined);

  const fetchCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await referralFetch<ReferralCodeRow[]>(
        '/referrals/admin/codes',
        'GET'
      );
      setCodes(data);
    } catch (error) {
      toastRef.current({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to fetch codes',
      });
    } finally {
      setIsLoading(false);
    }
  }, [referralFetch]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const resetForm = () => {
    setCode('');
    setDescription('');
    setMaxClaims(0);
    setExpiresAt('');
    setIsActive(true);
    setEditingId(undefined);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingId) {
        // Update existing code
        await referralFetch(`/referrals/admin/codes/${editingId}`, 'PUT', {
          description: description || null,
          maxClaims,
          expiresAt: expiresAt
            ? Math.floor(new Date(expiresAt).getTime() / 1000)
            : null,
          isActive,
        });
        toastRef.current({
          title: 'Saved',
          description: 'Referral code updated',
        });
      } else {
        // Create new code
        await referralFetch('/referrals/admin/codes', 'POST', {
          code,
          description: description || null,
          maxClaims,
          expiresAt: expiresAt
            ? Math.floor(new Date(expiresAt).getTime() / 1000)
            : null,
          createdBy: connectedAddress,
        });
        toastRef.current({
          title: 'Created',
          description: 'Referral code created',
        });
      }
      await fetchCodes();
      setCreateOpen(false);
      resetForm();
    } catch (error) {
      toastRef.current({
        variant: 'destructive',
        title: editingId ? 'Error updating code' : 'Error creating code',
        description: (error as Error)?.message || 'Request failed',
      });
    }
  };

  const handleEdit = (row: ReferralCodeRow) => {
    setEditingId(row.id);
    setCode(row.code || ''); // May be null for user-created codes
    setDescription(row.description || '');
    setMaxClaims(row.maxClaims);
    setExpiresAt(
      row.expiresAt
        ? format(fromUnixTime(row.expiresAt), "yyyy-MM-dd'T'HH:mm")
        : ''
    );
    setIsActive(row.isActive);
    setCreateOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await referralFetch(`/referrals/admin/codes/${deletingId}`, 'DELETE');
      toastRef.current({
        title: 'Deactivated',
        description: 'Referral code deactivated',
      });
      await fetchCodes();
    } catch (error) {
      toastRef.current({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error)?.message || 'Failed to deactivate code',
      });
    } finally {
      setDeleteConfirmOpen(false);
      setDeletingId(undefined);
    }
  };

  const handleViewAnalytics = async (id: number) => {
    setAnalyticsLoading(true);
    setAnalyticsOpen(true);
    try {
      const data = await referralFetch<AnalyticsData>(
        `/referrals/admin/codes/${id}/analytics`,
        'GET'
      );
      setAnalyticsData(data);
    } catch (error) {
      toastRef.current({
        variant: 'destructive',
        title: 'Error',
        description: (error as Error)?.message || 'Failed to fetch analytics',
      });
      setAnalyticsOpen(false);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const getStatus = (
    row: ReferralCodeRow
  ): 'active' | 'inactive' | 'expired' => {
    if (!row.isActive) return 'inactive';
    if (row.expiresAt && row.expiresAt <= Math.floor(Date.now() / 1000)) {
      return 'expired';
    }
    return 'active';
  };

  const columns: ColumnDef<ReferralCodeRow>[] = useMemo(
    () => [
      {
        header: 'Code',
        accessorKey: 'code',
        size: 150,
        cell: ({ row }) => {
          const codeValue = row.original.code;
          const codeHash = row.original.codeHash;
          const displayValue = codeValue || `${codeHash.slice(0, 10)}...`;
          const copyValue = codeValue || codeHash;
          return (
            <div className="flex items-center gap-2">
              <span className={`font-mono font-medium ${!codeValue ? 'text-muted-foreground' : ''}`}>
                {displayValue}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={async (e) => {
                  e.stopPropagation();
                  await navigator.clipboard.writeText(copyValue);
                  toastRef.current({
                    title: 'Copied',
                    description: codeValue ? 'Code copied to clipboard' : 'Hash copied to clipboard',
                    duration: 1500,
                  });
                }}
                aria-label="Copy code"
              >
                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          );
        },
      },
      {
        header: 'Description',
        accessorKey: 'description',
        size: 200,
        cell: ({ getValue }) => {
          const desc = getValue() as string | null;
          if (!desc) return <span className="text-muted-foreground">-</span>;
          const isLong = desc.length > 50;
          const truncated = isLong ? `${desc.slice(0, 50)}...` : desc;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={isLong ? 'cursor-help' : ''}>
                    {truncated}
                  </span>
                </TooltipTrigger>
                {isLong && (
                  <TooltipContent className="max-w-xs">
                    <p>{desc}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        header: 'Claims',
        accessorKey: 'claimCount',
        size: 100,
        cell: ({ row }) => {
          const claimCount = row.original.claimCount;
          const max = row.original.maxClaims;
          return (
            <Badge variant="secondary">
              {claimCount} / {max === 0 ? '\u221E' : max}
            </Badge>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        size: 100,
        cell: ({ row }) => {
          const status = getStatus(row.original);
          const variant =
            status === 'active'
              ? 'default'
              : status === 'expired'
                ? 'destructive'
                : 'secondary';
          return (
            <Badge variant={variant}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          );
        },
      },
      {
        header: 'Type',
        accessorKey: 'creatorType',
        size: 80,
        cell: ({ getValue }) => {
          const creatorType = getValue() as 'admin' | 'user';
          return (
            <Badge variant={creatorType === 'admin' ? 'outline' : 'secondary'}>
              {creatorType === 'admin' ? 'Admin' : 'User'}
            </Badge>
          );
        },
      },
      {
        header: 'Expires',
        accessorKey: 'expiresAt',
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (!v)
            return <span className="text-muted-foreground">Never</span>;
          const now = Math.floor(Date.now() / 1000);
          const isExpired = v <= now;
          let relative = '';
          try {
            relative = formatDistanceToNow(fromUnixTime(v), {
              addSuffix: true,
            });
          } catch {
            // ignore formatting errors
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`cursor-help ${isExpired ? 'text-red-500' : ''}`}
                  >
                    {relative}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{format(fromUnixTime(v), 'PPpp')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue() as string;
          if (!v) return '';
          const date = new Date(v);
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    {formatDistanceToNow(date, { addSuffix: true })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{format(date, 'PPpp')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 150,
        cell: ({ row }) => {
          const original = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleViewAnalytics(original.id)}
                aria-label="View analytics"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEdit(original)}
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-600"
                onClick={() => {
                  setDeletingId(original.id);
                  setDeleteConfirmOpen(true);
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  const filteredCodes = useMemo(() => {
    if (statusFilter === 'all') return codes;
    return codes.filter((code) => getStatus(code) === statusFilter);
  }, [codes, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Status:</span>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>

          {statusFilter !== 'all' && (
            <span className="text-sm text-muted-foreground">
              ({filteredCodes.length} {filteredCodes.length === 1 ? 'code' : 'codes'})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">{actionButtons}</div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Referral Code' : 'Create Referral Code'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 16))}
                required={!editingId}
                disabled={Boolean(editingId)}
                placeholder={editingId ? '(User-created code)' : 'e.g. SUMMER2024'}
                className="font-mono"
                maxLength={16}
              />
              {editingId ? (
                <p className="text-xs text-muted-foreground">
                  {code ? 'Code cannot be changed after creation' : 'User-created codes do not store plaintext'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {code.length}/16 characters
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Description (optional)
              </label>
              <Textarea
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                placeholder="Internal notes about this code..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Max Claims (0 = unlimited)
              </label>
              <Input
                type="number"
                min={0}
                value={maxClaims}
                onChange={(e) => setMaxClaims(parseInt(e.target.value, 10) || 0)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Expires At (optional)
              </label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            {editingId && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Active</label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Analytics: {analyticsData?.code || (analyticsData?.codeHash ? `${analyticsData.codeHash.slice(0, 10)}...` : 'Loading...')}
            </DialogTitle>
          </DialogHeader>
          {analyticsLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading analytics...
            </div>
          ) : analyticsData ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold">
                    {analyticsData.claimCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Claims
                  </div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold">
                    {analyticsData.totalVolume}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Volume
                  </div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold">
                    {analyticsData.totalPositions}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Positions
                  </div>
                </div>
              </div>

              {/* Claimants Table */}
              {analyticsData.claimants.length > 0 ? (
                <div>
                  <h4 className="font-medium mb-2">Claimants</h4>
                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Address</th>
                          <th className="p-2 text-right">Trading Volume</th>
                          <th className="p-2 text-right">Positions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.claimants.map((claimant) => (
                          <tr key={claimant.address} className="border-t">
                            <td className="p-2 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <span>
                                  {claimant.address.slice(0, 6)}...
                                  {claimant.address.slice(-4)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(
                                      claimant.address
                                    );
                                    toastRef.current({
                                      title: 'Copied',
                                      description: 'Address copied',
                                      duration: 1500,
                                    });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                            <td className="p-2 text-right">
                              {claimant.tradingVolume}
                            </td>
                            <td className="p-2 text-right">
                              {claimant.positionCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  No claimants yet
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Referral Code?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will deactivate the referral code. Users will no longer be able
            to claim it. This action can be reversed by editing the code.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Deactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Data Table */}
      <div>
        <DataTable columns={columns} data={filteredCodes} />
        {isLoading && (
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        )}
      </div>
    </div>
  );
};

export default ReferralCodesTab;
