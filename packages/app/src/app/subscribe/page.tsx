'use client';

import { Loader2, Plus } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { useResources } from '~/lib/hooks/useResources';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '~/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';

const SubscribeContent = () => {
  const { data: resources, isLoading } = useResources();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );
  const [chainId, setChainId] = useState<number>(
    chainIdParam ? Number(chainIdParam) : 1 // Default to Ethereum mainnet
  );
  const [marketAddress, setMarketAddress] = useState<string>(
    marketAddressParam || ''
  );

  useEffect(() => {
    if (marketAddressParam) {
      setMarketAddress(marketAddressParam);
    }
  }, [marketAddressParam]);

  useEffect(() => {
    if (chainIdParam) {
      setChainId(Number(chainIdParam));
    }
  }, [chainIdParam]);

  const handleResourceSelect = (resource: { slug: string; name: string }) => {
    // TODO: We'll need to get the market address and chain ID based on the resource
    // For now, we'll just open the dialog
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full m-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MarketProvider chainId={chainId} address={marketAddress} epoch={Number(1)}>
      <div className="flex-1 flex flex-col p-6">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <Popover>
              <PopoverTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Subscription
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-2">
                <div className="space-y-2">
                  {resources?.map((resource) => (
                    <button
                      key={resource.id}
                      onClick={() => handleResourceSelect(resource)}
                      className="w-full flex items-center space-x-2 p-2 hover:bg-muted rounded-md transition-colors"
                    >
                      <Image
                        src={resource.iconPath}
                        alt={resource.name}
                        width={20}
                        height={20}
                      />
                      <span className="flex-1 text-left">{resource.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[460px]">
            <Subscribe showMarketSwitcher={false} />
          </DialogContent>
        </Dialog>
      </div>
    </MarketProvider>
  );
};

const SubscribePage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center w-full m-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
};

export default SubscribePage;
