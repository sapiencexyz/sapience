'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import { formatDistanceToNow } from 'date-fns';

import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';

import CreateMarketDialog from './CreateMarketDialog';
import SettleMarketDialog from './SettleMarketDialog';

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <div className="container pt-16 lg:pt-24 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="ml-4">Launch New Market</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <CreateMarketDialog />
          </DialogContent>
        </Dialog>
      </header>
      <div>
        {isLoading && <p>Loading markets...</p>}
        {error && (
          <p className="text-red-500">Error loading markets: {error.message}</p>
        )}
        {marketGroups && marketGroups.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead className="text-right">Ends</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketGroups
                .flatMap((group) =>
                  group.markets.map((market) => ({ market, group }))
                )
                .sort((a, b) => b.market.endTimestamp - a.market.endTimestamp)
                .map(({ market, group }) => {
                  const isFuture = market.endTimestamp * 1000 > Date.now();

                  let buttonText = 'Settle';
                  let buttonDisabled = false;

                  if (market.settled) {
                    buttonText = 'Settled';
                    buttonDisabled = true;
                  } else if (isFuture) {
                    buttonText = 'In Progress';
                    buttonDisabled = true;
                  }

                  return (
                    <TableRow key={`${group.address}-${market.marketId}`}>
                      <TableCell className="font-medium">
                        {market.question || 'No question available'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatTimestamp(market.endTimestamp)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" disabled={buttonDisabled}>
                              {buttonText}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>{market.question}</DialogTitle>
                            </DialogHeader>
                            <SettleMarketDialog
                              market={market}
                              marketGroup={group}
                            />
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        ) : (
          !isLoading && <p>No active markets found.</p>
        )}
      </div>
    </div>
  );
};

export default Admin;
