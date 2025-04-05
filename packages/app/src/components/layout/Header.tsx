/* eslint-disable sonarjs/no-duplicate-string */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@foil/ui/components/ui/accordion';
import { Button } from '@foil/ui/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@foil/ui/components/ui/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { Menu, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

import ConnectButton from '../ConnectButton';
import EpochTiming from '../EpochTiming';
import ModeToggle from '../ModeToggle';
import { useFoil } from '~/lib/context/FoilProvider';
import {
  useResources,
  type Resource,
  type Epoch,
} from '~/lib/hooks/useResources';

// Extend the Epoch type with market properties
type ExtendedEpoch = Epoch & {
  marketChainId: string;
  marketAddress: string;
};

const isActive = (path: string, pathname: string) => {
  if (path === '/') {
    return pathname === path || pathname.startsWith('/resources');
  }
  if (path === 'trade' || path === 'pool') {
    return pathname.endsWith(path);
  }
  return pathname.startsWith(path);
};

const getMarketHref = (path: string, market: any) => {
  if (path === 'earn') {
    return `/earn/${market.chainId}:${market.address}`;
  }
  if (path === 'subscribe') {
    return `/subscribe/${market.chainId}:${market.address}`;
  }
  // For trade and pool paths
  return `/markets/${market.chainId}:${market.address}/periods/${market.currentEpoch?.epochId}/${path}`;
};

const handleLinkClick = (setStateFunction: (value: boolean) => void) => () => {
  setStateFunction(false);
};

const formatDuration = (start: number, end: number) => {
  return <EpochTiming startTimestamp={start} endTimestamp={end} />;
};

function MobileMarketLinks({
  path,
  onClose,
}: {
  path: string;
  onClose?: () => void;
}) {
  const { markets } = useFoil();
  const { data: resources, isLoading } = useResources();

  if (path === 'subscribe' || path === 'earn') {
    return (
      <div className="flex flex-col space-y-2">
        {markets.map((market) => (
          <Link
            key={market.id}
            href={getMarketHref(path, market)}
            onClick={() => onClose?.()}
            className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            {market.name}
          </Link>
        ))}
      </div>
    );
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Accordion type="multiple">
      {resources?.map((resource) => (
        <AccordionItem key={resource.id} value={resource.id.toString()}>
          <AccordionTrigger className=" hover:no-underline">
            <div className="flex items-center gap-2">
              <Image
                src={resource.iconPath}
                alt={resource.name}
                width={16}
                height={16}
                className=" "
              />
              {resource.name}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col space-y-2">
              {(() => {
                // Combine all epochs from all markets and sort them
                const allEpochs =
                  resource.markets
                    ?.reduce<ExtendedEpoch[]>((acc, market) => {
                      const marketEpochs =
                        market.epochs?.map((epoch: Epoch) => ({
                          ...epoch,
                          marketChainId: market.chainId.toString(),
                          marketAddress: market.address,
                        })) || [];
                      return [...acc, ...marketEpochs];
                    }, [])
                    ?.filter((epoch) => epoch.public)
                    ?.sort(
                      (a: ExtendedEpoch, b: ExtendedEpoch) =>
                        a.endTimestamp - b.endTimestamp
                    ) || [];

                if (!resource.markets?.length || allEpochs.length === 0) {
                  return (
                    <div className="text-center text-sm text-muted-foreground flex-1 flex items-center justify-center m-8">
                      No upcoming or active periods
                    </div>
                  );
                }

                const currentTime = Math.floor(Date.now() / 1000);
                const activeEpochs = allEpochs.filter(
                  (epoch) => epoch.endTimestamp > currentTime
                );

                if (activeEpochs.length === 0) {
                  return (
                    <div className="text-center text-sm text-muted-foreground flex-1 flex items-center justify-center m-8">
                      No upcoming or active periods
                    </div>
                  );
                }

                return (
                  <>
                    {activeEpochs.map((epoch) => (
                      <Link
                        key={`${epoch.marketChainId}:${epoch.marketAddress}:${epoch.epochId}`}
                        className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
                        href={`/markets/${epoch.marketChainId}:${epoch.marketAddress}/periods/${epoch.epochId}/${path}`}
                        onClick={() => onClose?.()}
                      >
                        {formatDuration(
                          epoch.startTimestamp,
                          epoch.endTimestamp
                        )}
                      </Link>
                    ))}
                    <Link
                      href={`/markets?resource=${resource.slug}`}
                      onClick={() => onClose?.()}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-end mt-2 px-3 py-1"
                    >
                      All periods
                      <ChevronDown className="h-3 w-3 ml-1 rotate-[-90deg]" />
                    </Link>
                  </>
                );
              })()}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

const ResourcePopover = ({ label, path }: { label: string; path: string }) => {
  const [hoveredResource, setHoveredResource] = useState<number | null>(null);
  const { data: resources, isLoading } = useResources();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (resources && resources.length > 0 && !hoveredResource) {
      setHoveredResource(resources[0].id);
    }
  }, [hoveredResource, resources]);

  if (isLoading) {
    return (
      <Button variant="ghost" className="text-base">
        {label}
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`text-base ${isActive(path, pathname) ? 'bg-secondary' : ''}`}
        >
          <span>{label}</span>
          <ChevronDown className="text-muted-foreground -mr-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          setOpen(false);
          setHoveredResource(resources?.[0]?.id ?? null);
        }}
      >
        <div className="flex">
          <div className="flex-1">
            {resources?.map((resource: Resource) => (
              <div
                key={resource.id}
                onMouseEnter={() => setHoveredResource(resource.id)}
              >
                <div
                  className={`text-sm w-full flex items-center gap-2 rounded-md px-3 py-1.5 
                    ${hoveredResource === resource.id ? 'bg-secondary' : 'bg-transparent'}
                    hover:bg-secondary cursor-pointer`}
                >
                  <Image
                    src={resource.iconPath}
                    alt={resource.name}
                    width={16}
                    height={16}
                    className=" "
                  />
                  {resource.slug === 'celestia-blobspace'
                    ? 'Celestia Blob Count'
                    : resource.name}
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 border-l border-border pl-3 ml-3">
            {hoveredResource && (
              <div className="flex flex-col h-full">
                {(() => {
                  const hoveredResourceData = resources?.find(
                    (r: Resource) => r.id === hoveredResource
                  );

                  // Combine all epochs from all markets and sort them
                  const allEpochs =
                    hoveredResourceData?.markets
                      ?.reduce<ExtendedEpoch[]>((acc, market) => {
                        const marketEpochs =
                          market.epochs?.map((epoch: Epoch) => ({
                            ...epoch,
                            marketChainId: market.chainId.toString(),
                            marketAddress: market.address,
                          })) || [];
                        return [...acc, ...marketEpochs];
                      }, [])
                      ?.filter((epoch) => epoch.public)
                      ?.sort(
                        (a: ExtendedEpoch, b: ExtendedEpoch) =>
                          a.endTimestamp - b.endTimestamp
                      ) || [];

                  if (
                    !hoveredResourceData?.markets?.length ||
                    allEpochs.length === 0
                  ) {
                    return (
                      <div className="text-center text-sm text-muted-foreground flex items-center justify-center h-full px-8">
                        No upcoming or active periods
                      </div>
                    );
                  }

                  const currentTime = Math.floor(Date.now() / 1000);
                  const activeEpochs = allEpochs.filter(
                    (epoch) => epoch.endTimestamp > currentTime
                  );

                  if (activeEpochs.length === 0) {
                    return (
                      <div className="text-center text-sm text-muted-foreground flex items-center justify-center h-full px-8">
                        No upcoming or active periods
                      </div>
                    );
                  }

                  return (
                    <>
                      {activeEpochs.map((epoch) => (
                        <Link
                          key={`${epoch.marketChainId}:${epoch.marketAddress}:${epoch.epochId}`}
                          className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-secondary"
                          href={`/markets/${epoch.marketChainId}:${epoch.marketAddress}/periods/${epoch.epochId}/${path}`}
                          onClick={handleLinkClick(setOpen)}
                        >
                          {formatDuration(
                            epoch.startTimestamp,
                            epoch.endTimestamp
                          )}
                        </Link>
                      ))}
                      <Link
                        href={`/markets?resource=${hoveredResourceData?.slug}`}
                        onClick={handleLinkClick(setOpen)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-end mt-2 px-3 py-1"
                      >
                        All periods
                        <ChevronDown className="h-3 w-3 ml-1 rotate-[-90deg]" />
                      </Link>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const MarketDrawerContent = ({
  title,
  path,
  onClose,
}: {
  title: string;
  path: string;
  onClose: () => void;
}) => (
  <div className="flex flex-col space-y-4 p-4 pb-8">
    <div>
      <div className="font-semibold mb-1">{title}</div>
      <MobileMarketLinks path={path} onClose={onClose} />
    </div>
  </div>
);

const NavLinks = ({
  isMobile = false,
  onClose,
}: {
  isMobile?: boolean;
  onClose?: () => void;
}) => {
  const pathname = usePathname();

  const getButtonClasses = (path: string) => {
    return `text-base ${isActive(path, pathname) ? 'bg-secondary' : ''}`;
  };

  if (isMobile) {
    return (
      <div className="flex flex-col space-y-4 font-medium py-4">
        <Link href="/subscribe" onClick={() => onClose?.()}>
          Subscribe
        </Link>
        {/*
        <Link href="/earn/ethereum-gas" onClick={() => onClose?.()}>
          Earn
        </Link>
        */}
        <Link href="/leaderboard" onClick={() => onClose?.()}>
          Leaderboard
        </Link>
        <Link href="https://docs.foil.xyz" onClick={() => onClose?.()}>
          Docs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center w-[50dvw] max-w-[800px] mx-auto">
      <Link href="/" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/')}>
          Explore
        </Button>
      </Link>

      <Link href="/subscribe" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/subscribe')}>
          Subscribe
        </Button>
      </Link>
      {/*
      <Link href="/earn/ethereum-gas" className="hover:no-underline mx-0.5">
        <Button variant="ghost" className={getButtonClasses('/earn')}>
          Earn
        </Button>
      </Link>
      */}
      <ResourcePopover label="Trade" path="trade" />
      <ResourcePopover label="Pool" path="pool" />
      <Link href="/leaderboard" className="hover:no-underline">
        <Button variant="ghost" className={getButtonClasses('/leaderboard')}>
          Leaderboard
        </Button>
      </Link>

      <Link href="https://docs.foil.xyz" className="hover:no-underline">
        <Button variant="ghost" className="text-base">
          Docs
        </Button>
      </Link>
    </div>
  );
};

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="w-full py-3 z-[3] border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto px-3 flex items-center justify-between">
          <Link href="/" className="inline-block">
            <div className="flex items-center gap-2">
              <div className="lg:hidden">
                <Image
                  src="/logomark.svg"
                  alt="Foil"
                  width={24}
                  height={24}
                  className="dark:invert"
                />
              </div>
              <div className="hidden lg:flex items-center gap-2">
                <Image
                  src="/logo.svg"
                  alt="Foil"
                  width={100}
                  height={28}
                  className="dark:invert"
                />
                <span className="text-xs font-medium ml-1 px-1.5 py-0.5 rounded bg-primary/5 text-primary/40 border border-primary/10 tracking-widest">
                  BETA
                </span>
              </div>
            </div>
          </Link>

          <div className="hidden lg:block">
            <NavLinks />
          </div>

          <div className="flex items-center gap-2">
            <ConnectButton />
            <div className="hidden lg:block">
              {!pathname.startsWith('/earn') && <ModeToggle />}
            </div>
          </div>
        </div>
      </header>
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border py-3 px-3 text-center z-[3] lg:hidden">
        <div className="flex justify-between items-center max-w-[400px] mx-auto">
          <Link href="/" className="hover:no-underline">
            <Button
              variant="ghost"
              size="lg"
              className={isActive('/', pathname) ? 'bg-secondary' : ''}
            >
              Explore
            </Button>
          </Link>

          <Drawer open={isTradeOpen} onOpenChange={setIsTradeOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="lg"
                className={isActive('trade', pathname) ? 'bg-secondary' : ''}
              >
                Trade
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <MarketDrawerContent
                title="Trade"
                path="trade"
                onClose={() => setIsTradeOpen(false)}
              />
            </DrawerContent>
          </Drawer>

          <Drawer open={isPoolOpen} onOpenChange={setIsPoolOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="lg"
                className={isActive('pool', pathname) ? 'bg-secondary' : ''}
              >
                Pool
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <MarketDrawerContent
                title="Pool"
                path="pool"
                onClose={() => setIsPoolOpen(false)}
              />
            </DrawerContent>
          </Drawer>

          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="flex flex-col space-y-4 p-4 position-relative">
                <NavLinks isMobile onClose={() => setIsOpen(false)} />
                <div className="absolute top-2 right-5">
                  {!pathname.startsWith('/earn') && <ModeToggle />}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </>
  );
};

export default Header;
