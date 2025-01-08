import { format } from 'date-fns';
import { Menu, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect } from 'react';

import ConnectButton from '../components/ConnectButton';
import { ModeToggle } from '../components/ModeToggle';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet';
import { useMarketList } from '~/lib/context/MarketListProvider';
import {
  useResources,
  type Resource,
  type Market,
  type Epoch,
} from '~/lib/hooks/useResources';

const getMarketHref = (path: string, market: any, withEpochs: boolean) => {
  if (path === 'earn') {
    return `/${path}/${market.chainId}:${market.address}`;
  }
  if (withEpochs) {
    return `/markets/?contractId=${market.chainId}:${market.address}`;
  }
  return `/${path}/${market.chainId}:${market.address}/epochs/${market.currentEpoch?.epochId}`;
};

const ResourcePopover = ({ label, path }: { label: string; path: string }) => {
  const [hoveredResource, setHoveredResource] = useState<number | null>(null);
  const { data: resources, isLoading } = useResources();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (resources && resources.length > 0 && !hoveredResource) {
      setHoveredResource(resources[0].id);
    }
  }, [hoveredResource, resources]);

  const formatDuration = (start: number, end: number) => {
    const endDate = new Date(end * 1000);
    const weeks = Math.round((end - start) / (7 * 24 * 3600));
    return (
      <>
        Ends {format(endDate, 'M/d')}
        <span className="text-xs text-muted-foreground ml-2">
          {weeks} week period
        </span>
      </>
    );
  };

  const handleLinkClick = () => {
    setOpen(false);
  };

  if (isLoading) {
    return (
      <Button variant="ghost" className="text-md">
        {label}
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="text-md">
          <span>{label}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-3"
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
                  />
                  {resource.name}
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 border-l border-border pl-3 ml-3">
            {hoveredResource && (
              <div className="flex flex-col space-y-1">
                {(() => {
                  const hoveredResourceData = resources?.find(
                    (r: Resource) => r.id === hoveredResource
                  );
                  const market = hoveredResourceData?.markets?.[0];
                  const epochs = market?.epochs ?? [];

                  if (!market || epochs.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground h-full flex items-center justify-center py-4">
                        No active periods
                      </div>
                    );
                  }

                  return epochs.map((epoch: Epoch) => (
                    <Link
                      key={epoch.epochId}
                      className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-secondary"
                      href={`/${path}/${market.chainId}:${market.address}/epochs/${epoch.epochId}`}
                      onClick={handleLinkClick}
                    >
                      {formatDuration(epoch.startTimestamp, epoch.endTimestamp)}
                    </Link>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const NavLinks = ({
  isMobile = false,
  onClose,
}: {
  isMobile?: boolean;
  onClose?: () => void;
}) => {
  const { markets } = useMarketList();
  const { data: resources, isLoading } = useResources();
  const publicMarkets = markets.filter((m) => m.public);
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') {
      return (
        pathname === path ||
        pathname.startsWith('/explore') ||
        pathname.startsWith('/resources')
      );
    }
    return pathname.startsWith(path);
  };

  const getButtonClasses = (path: string) => {
    return `text-md ${isActive(path) ? 'bg-secondary' : ''}`;
  };

  const formatDuration = (start: number, end: number) => {
    const startDate = new Date(start * 1000);
    const endDate = new Date(end * 1000);
    const weeks = Math.round((end - start) / (7 * 24 * 3600));
    return (
      <>
        {format(endDate, 'M/d')}
        <span className="text-sm text-muted-foreground ml-2">
          {weeks} week period
        </span>
      </>
    );
  };

  const renderMobileMarketLinks = (path: string) => {
    if (path === 'subscribe' || path === 'earn') {
      return (
        <div className="flex flex-col space-y-2">
          {publicMarkets.map((market) => (
            <Link
              key={market.id}
              href={getMarketHref(path, market, false)}
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
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Image
                  src={resource.iconPath}
                  alt={resource.name}
                  width={16}
                  height={16}
                />
                {resource.name}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col space-y-2">
                {(() => {
                  const market = resource.markets[0];
                  const epochs = market?.epochs ?? [];

                  if (!market || epochs.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground h-full flex items-center justify-center py-4">
                        No active periods
                      </div>
                    );
                  }

                  return epochs.map((epoch) => (
                    <Link
                      key={epoch.epochId}
                      className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
                      href={`/${path}/${market.chainId}:${market.address}/epochs/${epoch.epochId}`}
                      onClick={() => onClose?.()}
                    >
                      {formatDuration(epoch.startTimestamp, epoch.endTimestamp)}
                    </Link>
                  ));
                })()}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  if (isMobile) {
    return (
      <div className="flex flex-col space-y-4">
        <Link
          href="/"
          onClick={() => onClose?.()}
          className="hover:no-underline"
        >
          Explore
        </Link>
        <div>
          <div className="font-bold mb-1">Subscribe</div>
          {renderMobileMarketLinks('subscribe')}
        </div>
        <div>
          <div className="font-bold mb-1">Earn</div>
          {renderMobileMarketLinks('earn')}
        </div>
        <div>
          <div className="font-bold mb-1">Trade</div>
          {renderMobileMarketLinks('trade')}
        </div>
        <div>
          <div className="font-bold mb-1">Pool</div>
          {renderMobileMarketLinks('pool')}
        </div>
        <Link
          href="https://docs.foil.xyz"
          onClick={() => onClose?.()}
          className="hover:no-underline"
        >
          Docs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Link href="/" className="hover:no-underline mx-0.5">
        <Button variant="ghost" className={getButtonClasses('/')}>
          Explore
        </Button>
      </Link>

      <Link href="/subscribe" className="hover:no-underline mx-0.5">
        <Button variant="ghost" className={getButtonClasses('/subscribe')}>
          Subscribe
        </Button>
      </Link>

      <Link href="/earn" className="hover:no-underline mx-0.5">
        <Button variant="ghost" className={getButtonClasses('/earn')}>
          Earn
        </Button>
      </Link>

      <ResourcePopover label="Trade" path="trade" />
      <ResourcePopover label="Pool" path="pool" />

      <Link href="https://docs.foil.xyz" className="hover:no-underline mx-0.5">
        <Button variant="ghost" className="text-md">
          Docs
        </Button>
      </Link>
    </div>
  );
};

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024); // lg breakpoint
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <header className="w-full py-3 z-[3] border-b border-border">
      <div className="mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="inline-block">
          <Image
            src="/logo.svg"
            alt="Foil"
            width={100}
            height={28}
            className="dark:invert"
          />
        </Link>

        {isMobile ? (
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex flex-col space-y-4 mt-4">
                <NavLinks isMobile onClose={() => setIsOpen(false)} />
                <ConnectButton />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="flex gap-6 items-center font-semibold w-full">
            <div className="mx-auto">
              <NavLinks />
            </div>
            <div className="flex gap-2 items-center">
              <ConnectButton />
              <ModeToggle />
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
