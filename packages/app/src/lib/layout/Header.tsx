import { format } from 'date-fns';
import { Menu, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '~/components/ui/sheet';
import { useMarketList } from '~/lib/context/MarketListProvider';

const getMarketHref = (path: string, market: any, withEpochs: boolean) => {
  if (path === 'earn') {
    return `/${path}/${market.chainId}:${market.address}`;
  }
  if (withEpochs) {
    return `/markets/?contractId=${market.chainId}:${market.address}`;
  }
  return `/${path}/${market.chainId}:${market.address}/epochs/${market.currentEpoch?.epochId}`;
};

const NavPopover = ({
  label,
  path,
  withEpochs = false,
}: {
  label: string;
  path: string;
  withEpochs?: boolean;
}) => {
  const [hoveredMarket, setHoveredMarket] = useState<number | null>(null);
  const { markets } = useMarketList();
  const [open, setOpen] = useState(false);

  const publicMarkets = markets.filter((m) => m.public);

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d');
  };

  useEffect(() => {
    if (publicMarkets.length > 0 && !hoveredMarket) {
      setHoveredMarket(publicMarkets[0].id);
    }
  }, [hoveredMarket, publicMarkets]);

  const handleLinkClick = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="gap-2">
          {label} <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`${withEpochs ? 'w-[400px]' : 'w-[220px]'} p-3`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          setOpen(false);
          setHoveredMarket(publicMarkets[0]?.id);
        }}
      >
        <div className="flex">
          <div className="flex-1">
            {publicMarkets.map((market) => (
              <div
                key={market.id}
                onMouseEnter={() => setHoveredMarket(market.id)}
              >
                {market.currentEpoch && (
                  <Link
                    className={`text-sm w-full block rounded-md px-3 py-1.5 
                      ${hoveredMarket === market.id ? 'bg-gray-100' : 'bg-transparent'}
                      hover:bg-gray-100`}
                    href={getMarketHref(path, market, withEpochs)}
                    onClick={handleLinkClick}
                  >
                    {market.name}
                  </Link>
                )}
              </div>
            ))}
          </div>
          {withEpochs && (
            <div className="flex-1 border-l border-gray-200 pl-3 ml-3">
              {hoveredMarket && (
                <div className="flex flex-col space-y-1">
                  {(() => {
                    const hoveredMarketData = publicMarkets.find(
                      (m) => m.id === hoveredMarket
                    );
                    const chainId = hoveredMarketData?.chainId;
                    const address = hoveredMarketData?.address;

                    return hoveredMarketData?.epochs.map((epoch) => (
                      <Link
                        key={epoch.epochId}
                        className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
                        href={`/${path}/${chainId}:${address}/epochs/${epoch.epochId}`}
                        onClick={handleLinkClick}
                      >
                        {formatTimestamp(epoch.startTimestamp)} -{' '}
                        {formatTimestamp(epoch.endTimestamp)}
                      </Link>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
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
  const publicMarkets = markets.filter((m) => m.public);

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d, HH:mm');
  };

  const renderMobileMarketLinks = (path: string, withEpochs = false) => {
    if (path === 'subscribe') {
      return (
        <div className="flex flex-col space-y-2">
          {publicMarkets.map((market) => (
            <Link
              key={market.id}
              href={getMarketHref(path, market, withEpochs)}
              onClick={() => onClose?.()}
              className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
            >
              {market.name}
            </Link>
          ))}
        </div>
      );
    }

    return (
      <Accordion type="multiple">
        {publicMarkets.map((market) => (
          <AccordionItem key={market.id} value={market.id.toString()}>
            <AccordionTrigger className="hover:no-underline">
              <Link
                href={getMarketHref(path, market, withEpochs)}
                onClick={(e) => {
                  if (withEpochs) {
                    e.preventDefault();
                  } else if (onClose) {
                    onClose();
                  }
                }}
                className="hover:no-underline"
              >
                {market.name}
              </Link>
            </AccordionTrigger>
            {withEpochs && (
              <AccordionContent className="pl-4">
                <div className="flex flex-col space-y-2">
                  {market.epochs.map((epoch) => (
                    <Link
                      key={epoch.epochId}
                      className="text-sm w-full block rounded-md px-3 py-1.5 hover:bg-gray-50"
                      href={`/${path}/${market.chainId}:${market.address}/epochs/${epoch.epochId}`}
                      onClick={() => onClose?.()}
                    >
                      {formatTimestamp(epoch.startTimestamp)} -{' '}
                      {formatTimestamp(epoch.endTimestamp)}
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  if (isMobile) {
    return (
      <div className="flex flex-col space-y-4">
        <div>
          <div className="font-bold mb-1">Subscribe</div>
          {renderMobileMarketLinks('subscribe')}
        </div>
        {/*
        <div>
          <div className="font-bold mb-1">
            Earn
          </div>
          {renderMobileMarketLinks('earn')}
        </div>
        */}
        <div>
          <div className="font-bold mb-1">Trade</div>
          {renderMobileMarketLinks('trade', true)}
        </div>
        <div>
          <div className="font-bold mb-1">Pool</div>
          {renderMobileMarketLinks('pool', true)}
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
    <div className="flex gap-3">
      <NavPopover label="Subscribe" path="subscribe" />
      {/* <NavPopover label="Earn" path="earn" /> */}
      <NavPopover label="Trade" path="trade" withEpochs />
      <NavPopover label="Pool" path="pool" withEpochs />
      <Link href="https://docs.foil.xyz" className="hover:no-underline">
        <Button variant="ghost">Docs</Button>
      </Link>
    </div>
  );
};

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <header className="w-full py-3 z-[3] border-b border-border">
      <div className="mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="inline-block">
          <Image src="/logo.svg" alt="Foil" width={100} height={28} />
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
