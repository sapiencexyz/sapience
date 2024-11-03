import { format } from 'date-fns';
import { ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useContext, useState } from 'react';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { ScrollArea } from '~/components/ui/scroll-area';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';
import { cn } from '~/lib/utils';

const EpochSelector: React.FC = () => {
  const { chain, address, epoch } = useContext(MarketContext);
  const { markets } = useMarketList();
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const currentMarket = markets.find(
    (market) => market.address === address && market.chainId === chain?.id
  );

  const handleEpochSelect = (selectedEpoch: number) => {
    router.push(`/trade/${chain?.id}:${address}/epochs/${selectedEpoch}`);
    handleClose();
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d, yyyy');
  };

  return (
    <>
      <Button onClick={handleOpen} variant="outline" size="sm" className="ml-4">
        Epoch {epoch}
        <ChevronsUpDown className="ml-0.5 h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Epoch</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] px-1">
            <div className="flex flex-col gap-2">
              {currentMarket?.epochs.map((epochData) => (
                <button
                  type="button"
                  key={epochData.id}
                  onClick={() => handleEpochSelect(epochData.epochId)}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-md px-4 py-2 text-left',
                    'hover:bg-muted',
                    epochData.epochId === epoch ? 'bg-muted' : 'bg-transparent'
                  )}
                >
                  <span className="font-bold">Epoch {epochData.epochId}</span>
                  <div>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(epochData.startTimestamp)} -{' '}
                      {formatDate(epochData.endTimestamp)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EpochSelector;
