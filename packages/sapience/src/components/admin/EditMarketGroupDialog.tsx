'use client';

import { Button, Input, Label } from '@sapience/ui';
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
import { useSignMessage } from 'wagmi';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useResources } from '~/hooks/useResources';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL as string;

type Props = {
  group: EnrichedMarketGroup;
};

const EditMarketGroupDialog = ({ group }: Props) => {
  const isDeployed = Boolean(group.address);
  const { data: resources } = useResources();
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

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
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });

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

    const res = await fetch(`${API_BASE_URL}/marketGroups/${group.address}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: group.chainId,
        data,
        signature,
        timestamp,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Failed to update market group');
    }
    return json;
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
        queryKey: ['marketGroup', group.address, group.chainId],
      });
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
          Edit Group
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
            <textarea
              id="rules"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMarketGroupDialog;
