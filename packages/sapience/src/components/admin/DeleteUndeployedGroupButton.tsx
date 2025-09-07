'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@sapience/ui/components/ui/dialog';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useAdminApi } from '~/hooks/useAdminApi';

type Props = { group: EnrichedMarketGroup };

export default function DeleteUndeployedGroupButton({ group }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { deleteJson } = useAdminApi();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return deleteJson(`/marketGroups/${group.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['enrichedMarketGroups'],
      });
      toast({ title: 'Deleted', description: 'Market group removed.' });
      setOpen(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast({ variant: 'destructive', title: 'Error', description: message });
    },
  });

  if (group.address) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="w-4 h-4 mr-1" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete market group?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently remove this undeployed market group and its
          markets.
        </p>
        <DialogFooter>
          <div className="flex gap-2 justify-end w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
