'use client';

import { Button, Input, Label } from '@sapience/ui';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Switch } from '@sapience/ui/components/ui/switch';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import EditMarketDialog from './EditMarketDialog';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useResources } from '~/hooks/useResources';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useAdminApi } from '~/hooks/useAdminApi';

type Props = {
  group: EnrichedMarketGroup;
};

const EditMarketGroupDialog = ({ group }: Props) => {
  const isDeployed = Boolean(group.address);
  const { data: resources } = useResources();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { putJson } = useAdminApi();

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(group.question || '');
  const [categorySlug, setCategorySlug] = useState(group.category?.slug || '');
  const [resourceId, setResourceId] = useState<number | null>(
    (group as any).resource?.id || null
  );
  const [isCumulative, setIsCumulative] = useState<boolean>(
    group.isCumulative || false
  );
  const [baseTokenName, setBaseTokenName] = useState(group.baseTokenName || '');
  const [quoteTokenName, setQuoteTokenName] = useState(
    group.quoteTokenName || ''
  );
  const [rules, setRules] = useState<string>((group as any).rules || '');

  useEffect(() => {
    // When resource toggles, adjust token names similar to Create form behavior
    if (!isDeployed) {
      if (resourceId == null) {
        if (!baseTokenName) setBaseTokenName('Yes');
        if (!quoteTokenName) setQuoteTokenName('sUSDS');
      } else {
        // For indexed markets clear to let creator set
        // Do not overwrite if user typed something
      }
    }
  }, [resourceId, isDeployed]);

  const canEditTokens = !isDeployed;

  const updateCall = async () => {
    const data: Record<string, unknown> = {
      question,
      rules,
      category: categorySlug,
      resourceId,
      isCumulative,
    };
    if (canEditTokens) {
      data.baseTokenName = baseTokenName;
      data.quoteTokenName = quoteTokenName;
    }

    if (isDeployed) {
      return putJson(`/marketGroups/${group.address}`, {
        chainId: group.chainId,
        data,
      });
    }
    return putJson(`/marketGroups/by-id/${group.id}`, {
      data,
    });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: updateCall,
    onSuccess: async () => {
      toast({
        title: 'Group Updated',
        description: 'Changes saved successfully.',
      });
      await queryClient.invalidateQueries({ queryKey: ['marketGroups'] });
      await queryClient.invalidateQueries({
        queryKey: ['enrichedMarketGroups'],
      });
      if (isDeployed) {
        await queryClient.invalidateQueries({
          queryKey: ['marketGroup', group.address, group.chainId],
        });
      }
      setOpen(false);
    },
    onError: (e: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: e?.message || 'Unknown error',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Edit Market Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-2">
          <div className="space-y-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={categorySlug} onValueChange={setCategorySlug}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {FOCUS_AREAS.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resource">Index</Label>
              <Select
                value={resourceId?.toString() || 'none'}
                onValueChange={(value) =>
                  setResourceId(value === 'none' ? null : Number(value))
                }
              >
                <SelectTrigger id="resource">
                  <SelectValue placeholder="Select a resource (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {resources?.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseTokenName">Base Token Name</Label>
              <Input
                id="baseTokenName"
                value={baseTokenName}
                onChange={(e) => setBaseTokenName(e.target.value)}
                disabled={!canEditTokens}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quoteTokenName">Quote Token Name</Label>
              <Input
                id="quoteTokenName"
                value={quoteTokenName}
                onChange={(e) => setQuoteTokenName(e.target.value)}
                disabled={!canEditTokens}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rules">Rules</Label>
            <Textarea
              id="rules"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="This will be settled based on reporting from ...."
            />
          </div>
          {resourceId !== null && (
            <div className="flex items-center gap-2 py-2">
              <Label htmlFor="isCumulative" className="font-medium">
                Cumulative
              </Label>
              <Switch
                id="isCumulative"
                checked={isCumulative}
                onCheckedChange={setIsCumulative}
              />
            </div>
          )}
          <Button
            onClick={() => mutate()}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          {group.markets && group.markets.length > 0 ? (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold">Markets</h3>
              <div className="space-y-2">
                {group.markets.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {m.question || `Market ${m.marketId || m.id}`}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Option: {m.optionName || '-'}
                      </div>
                    </div>
                    <EditMarketDialog group={group} market={m as any} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMarketGroupDialog;
