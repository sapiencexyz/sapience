'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from '@sapience/ui/components/ui/table';
import { TooltipProvider } from '@sapience/ui/components/ui/tooltip';
import MessageGroupRow from './MessageGroupRow';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import {
  useRelayerMessageLog,
  type GroupCategory,
} from '~/hooks/relayer/useRelayerMessageLog';

type FilterTab = 'all' | GroupCategory;

const StreamReview = () => {
  const { groups, clear } = useRelayerMessageLog();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [connected, setConnected] = useState(false);

  const { apiBaseUrl } = useSettings();

  useEffect(() => {
    const wsUrl = toAuctionWsUrl(apiBaseUrl);
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);

    const offOpen = client.addOpenListener(() => setConnected(true));
    const offClose = client.addCloseListener(() => setConnected(false));

    return () => {
      offOpen();
      offClose();
    };
  }, [apiBaseUrl]);

  const filtered = useMemo(() => {
    if (filter === 'all') return groups;
    return groups.filter((g) => g.category === filter);
  }, [groups, filter]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">Stream</h1>
              <span
                className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                title={connected ? 'Connected' : 'Disconnected'}
              />
            </div>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="rfq">RFQ</TabsTrigger>
                <TabsTrigger value="secondary">Secondary</TabsTrigger>
                <TabsTrigger value="vault">Vault</TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm" onClick={clear}>
                Clear
              </Button>
            </div>
          </div>

          <TabsContent value={filter} className="mt-4">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No messages yet. Waiting for activity…
              </div>
            ) : (
              <div className="border rounded-md bg-black">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 h-8 py-1 text-xs">
                        Time
                      </TableHead>
                      <TableHead className="w-28 h-8 py-1 text-xs">
                        Type
                      </TableHead>
                      <TableHead className="w-36 h-8 py-1 text-xs">
                        Channel
                      </TableHead>
                      <TableHead className="h-8 py-1" />
                      <TableHead className="w-28 h-8 py-1" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((group) => (
                      <MessageGroupRow key={group.groupId} group={group} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};

export default StreamReview;
