'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
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
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';
import DataTable from './data-table';
import ResolveConditionCell from './ResolveConditionCell';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useCategories } from '~/hooks/graphql/useMarketGroups';
import { useConditions } from '~/hooks/graphql/useConditions';

type RFQRow = {
  id?: string;
  question: string;
  category?: { id?: number; name?: string; slug?: string };
  endTime?: number;
  public?: boolean;
  claimStatement: string;
  description: string;
  similarMarketUrls?: string[];
};

type RFQTabProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
};

const RFQTab = ({ createOpen, setCreateOpen }: RFQTabProps) => {
  const { toast } = useToast();
  const { postJson, putJson } = useAdminApi();
  const { data: categories } = useCategories();
  const { data: conditions, isLoading, refetch } = useConditions({ take: 200 });

  const [question, setQuestion] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [claimStatement, setClaimStatement] = useState('');
  const [description, setDescription] = useState('');
  const [similarMarketsText, setSimilarMarketsText] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setQuestion('');
    setCategorySlug('');
    setEndTime('');
    setIsPublic(true);
    setClaimStatement('');
    setDescription('');
    setSimilarMarketsText('');
    setEditingId(undefined);
  };

  const columns: ColumnDef<RFQRow>[] = useMemo(
    () => [
      {
        header: 'ID',
        accessorKey: 'id',
        sortingFn: 'alphanumeric',
        cell: ({ getValue }) => {
          const id = getValue() as string | undefined;
          if (!id) return '';
          const truncated =
            id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono">{truncated}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={async (e) => {
                  e.stopPropagation();
                  await navigator.clipboard.writeText(id);
                  toast({
                    title: 'Copied',
                    description: 'ID copied to clipboard',
                    duration: 1500,
                  });
                }}
                aria-label="Copy ID"
              >
                <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          );
        },
      },
      { header: 'Question', accessorKey: 'question' },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row) => row.category?.name ?? row.category?.slug ?? '',
        sortingFn: 'alphanumeric',
      },
      {
        header: 'End Time',
        accessorKey: 'endTime',
        cell: ({ getValue }) => {
          const v = getValue() as number | undefined;
          if (!v) return '';
          let relative = '';
          try {
            relative = formatDistanceToNow(fromUnixTime(v), {
              addSuffix: true,
            });
          } catch {
            // ignore formatting errors
          }
          return (
            <div className="flex items-baseline gap-2">
              <span className="font-mono">{v}</span>
              {relative ? (
                <span className="text-xs text-muted-foreground">
                  ({relative})
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: 'Public',
        accessorKey: 'public',
        cell: ({ getValue }) => ((getValue() as boolean) ? 'Yes' : 'No'),
      },
      { header: 'Claim Statement', accessorKey: 'claimStatement' },
      { header: 'Description/Rules', accessorKey: 'description' },
      {
        id: 'similarMarketUrls',
        header: 'Similar Markets',
        accessorFn: (row) => row.similarMarketUrls?.join(', ') ?? '',
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => {
          const original = row.original;
          const id = original.id;
          if (!id) return null;
          return (
            <div className="flex items-center gap-2">
              <ResolveConditionCell
                marketId={id as `0x${string}`}
                endTime={original.endTime}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(id);
                  setQuestion(original.question || '');
                  setCategorySlug(original.category?.slug || '');
                  setEndTime(String(original.endTime ?? ''));
                  setIsPublic(Boolean(original.public));
                  setClaimStatement(original.claimStatement || '');
                  setDescription(original.description || '');
                  setSimilarMarketsText(
                    (original.similarMarketUrls || []).join(', ')
                  );
                  setCreateOpen(true);
                }}
              >
                Edit
              </Button>
            </div>
          );
        },
      },
    ],
    [toast]
  );

  const rows: RFQRow[] = useMemo(() => {
    return (conditions || []).map((c) => ({
      id: c.id,
      question: c.question,
      category: c.category || undefined,
      endTime: c.endTime,
      public: c.public,
      claimStatement: c.claimStatement,
      description: c.description,
      similarMarketUrls: c.similarMarkets,
    }));
  }, [conditions]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const similarMarkets = similarMarketsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingId) {
        const body = {
          question,
          ...(categorySlug ? { categorySlug } : {}),
          public: isPublic,
          description,
          similarMarkets,
        };
        await putJson<RFQRow>(`/conditions/${editingId}`, body);
        await refetch();
        toast({ title: 'Saved', description: 'Condition updated' });
        setCreateOpen(false);
        resetForm();
      } else {
        const body = {
          question,
          ...(categorySlug ? { categorySlug } : {}),
          endTime: Number(endTime),
          public: isPublic,
          claimStatement,
          description,
          similarMarkets,
        };
        await postJson<RFQRow>(`/conditions`, body);
        // Refresh list to reflect server state and close the modal
        await refetch();
        toast({ title: 'Created', description: 'Condition created' });
        setCreateOpen(false);
        resetForm();
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: editingId
          ? 'Error updating condition'
          : 'Error creating condition',
        description: (e as Error)?.message || 'Request failed',
      });
    }
  };

  return (
    <div className="py-6 space-y-6">
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Condition' : 'Create Condition'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Question</label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={categorySlug} onValueChange={setCategorySlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                End Time (Unix seconds)
              </label>
              <Input
                type="number"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                disabled={Boolean(editingId)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Public</label>
              <div className="flex items-center h-10">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Claim Statement</label>
              <Input
                value={claimStatement}
                onChange={(e) => setClaimStatement(e.target.value)}
                required
                disabled={Boolean(editingId)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description / Rules</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">
                Similar Markets (comma-separated URLs)
              </label>
              <Input
                placeholder="https://..., https://..."
                value={similarMarketsText}
                onChange={(e) => setSimilarMarketsText(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div>
        <DataTable columns={columns} data={rows} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        ) : null}
      </div>
    </div>
  );
};

export default RFQTab;
