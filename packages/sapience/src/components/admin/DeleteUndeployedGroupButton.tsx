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
import { useSignMessage } from 'wagmi';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { foilApi } from '~/lib/utils/util';

type Props = { group: EnrichedMarketGroup };

export default function DeleteUndeployedGroupButton({ group }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });
      const res = await fetch(`${foilApi.baseUrl}/marketGroups/${group.id}`, {
        method: 'DELETE',
        headers: foilApi.getHeaders(),
        body: JSON.stringify({ signature, timestamp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data && data.error) || 'Failed to delete');
      }
      return res.json();
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
