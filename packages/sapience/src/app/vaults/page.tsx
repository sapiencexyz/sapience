'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';

// Mock data for vault tables
const marketMakingVaults = [
  {
    account: '0x1234567890123456789012345678901234567890',
    apr: 12.5,
    tvl: 150000,
    yourDeposit: 5000,
    age: 45,
  },
  {
    account: '0x2345678901234567890123456789012345678901',
    apr: -3.2,
    tvl: 85000,
    yourDeposit: 0,
    age: 32,
  },
  {
    account: '0x3456789012345678901234567890123456789012',
    apr: 8.7,
    tvl: 220000,
    yourDeposit: 12000,
    age: 67,
  },
];

const parlayVaults = [
  {
    account: '0x6789012345678901234567890123456789012345',
    apr: 6.4,
    tvl: 75000,
    yourDeposit: 3000,
    age: 28,
  },
  {
    account: '0x7890123456789012345678901234567890123456',
    apr: 11.2,
    tvl: 120000,
    yourDeposit: 0,
    age: 51,
  },
  {
    account: '0x8901234567890123456789012345678901234567',
    apr: -2.5,
    tvl: 200000,
    yourDeposit: 15000,
    age: 74,
  },
];

// Shared Coming Soon Overlay Component
const ComingSoonOverlay = () => (
  <div className="absolute inset-0 bg-background/30 backdrop-blur-sm flex items-center justify-center rounded-md z-50">
    <div className="text-center">
      <h3 className="text-lg font-semibold text-muted-foreground">
        Coming Soon
      </h3>
    </div>
  </div>
);

// Learn More Link Component with Tooltip
const LearnMoreLink = () => (
  <span className="relative inline-block group">
    <button className="text-primary hover:text-primary/80 font-medium cursor-pointer flex items-center gap-1">
      Learn more
    </button>
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-background border border-border rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
      Coming soon
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border"></div>
    </div>
  </span>
);

const VaultsPage = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      // Guard already exists here, but keeping it doesn't hurt
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          // Try to inject a style element to force light mode
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          // Security policy might prevent this
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      // Ensure load event listener is attached only once iframe exists
      iframe.addEventListener('load', handleIframeLoad);
      // Clean up listener on unmount
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []); // Empty dependency array ensures this runs once client-side

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatAPR = (apr: number) => {
    const isPositive = apr >= 0;
    return (
      <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
        {isPositive ? '+' : ''}
        {apr.toFixed(1)}%
      </span>
    );
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="relative min-h-screen">
      {/* Spline Background - Full Width */}
      <div className="absolute inset-0 pointer-events-none top-0 left-0 w-full h-100dvh -scale-y-100 -translate-y-1/4 opacity-50 dark:opacity-75">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          className="w-full h-full"
          style={{
            opacity: 0.5,
            border: 'none',
            colorScheme: 'light',
            filter: 'none',
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
        <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
      </div>

      {/* Main Content */}
      <div className="container max-w-[750px] mx-auto px-4 py-32 relative z-10">
        <h1 className="text-3xl md:text-5xl font-heading font-normal mb-6 md:mb-12">
          Vaults
        </h1>

        <div className="grid grid-cols-1 gap-16">
          {/* Pre-deposit Vaults */}
          <div>
            <h2 className="text-2xl font-heading font-normal mb-4">
              Pre-deposit Vault
            </h2>
            <p className="text-muted-foreground mb-6">
              Earn points by providing USDe to this vault, signaling your intent
              to roll this liquidity into other vaults upon launch. Withdraw at
              any time. <LearnMoreLink />
            </p>

            {/* Conversion UI */}
            <Card className="relative bg-background/[0.2] backdrop-blur-[2px] border border-gray-500/20 rounded-xl shadow-sm">
              <CardContent className="p-4">
                <Tabs defaultValue="predeposit" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="predeposit">Predeposit</TabsTrigger>
                    <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                  </TabsList>

                  <TabsContent value="predeposit" className="space-y-4">
                    {/* Amount Section */}
                    <div className="space-y-2">
                      <div className="border border-input bg-background rounded-md p-3">
                        <label className="text-sm font-medium mb-2 block">
                          Amount
                        </label>
                        <div className="flex items-center justify-between mb-1">
                          <Input
                            placeholder="0.0"
                            className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <Select defaultValue="USDe">
                            <SelectTrigger className="w-auto bg-transparent border-none h-auto p-0 gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    $
                                  </span>
                                </div>
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USDe">USDe</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">≈ $0</span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                            >
                              MAX
                            </Button>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span>0 USDe</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Connect Wallet Button */}
                    <Button className="w-full py-3 px-4 rounded text-base font-normal">
                      Connect Wallet →
                    </Button>
                  </TabsContent>

                  <TabsContent value="withdraw" className="space-y-4">
                    {/* Withdraw Section - Similar structure but for withdrawing sapUSDe */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount</label>
                      <div className="border border-input bg-background rounded-md p-3">
                        <div className="flex items-center justify-between mb-1">
                          <Input
                            placeholder="0.0"
                            className="text-2xl bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <Select defaultValue="sapUSDe">
                            <SelectTrigger className="w-auto bg-transparent border-none h-auto p-0 gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-muted-foreground">
                                    S
                                  </span>
                                </div>
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sapUSDe">sapUSDe</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">≈ $0</span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                            >
                              MAX
                            </Button>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span>0 sapUSDe</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full py-3 px-4 rounded text-base font-normal">
                      Connect Wallet →
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>

              {/* Coming Soon Overlay */}
              <ComingSoonOverlay />
            </Card>
          </div>

          {/* LP Vaults */}
          <div>
            <h2 className="text-2xl font-heading font-normal mb-4">
              LP Vaults
            </h2>
            <p className="text-muted-foreground mb-4">
              These vaults quote a spread around the predictions of forecasters.{' '}
              <LearnMoreLink />
            </p>

            {/* Market-Making Vaults Table */}
            <div className="relative rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Forecaster</TableHead>
                    <TableHead>APR</TableHead>
                    <TableHead>TVL</TableHead>
                    <TableHead>Your Deposit</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marketMakingVaults.map((vault, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {truncateAddress(vault.account)}
                        </span>
                      </TableCell>
                      <TableCell>{formatAPR(vault.apr)}</TableCell>
                      <TableCell>{formatCurrency(vault.tvl)} USDe</TableCell>
                      <TableCell>
                        {formatCurrency(vault.yourDeposit)} USDe
                      </TableCell>
                      <TableCell>{vault.age} days</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs font-normal"
                        >
                          Deposit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Coming Soon Overlay */}
              <ComingSoonOverlay />
            </div>
          </div>

          {/* Parlay Vaults */}
          <div>
            <h2 className="text-2xl font-heading font-normal mb-4">
              Parlay Vaults
            </h2>
            <p className="text-muted-foreground mb-4">
              These vaults are used to fill orders for parlays.{' '}
              <LearnMoreLink />
            </p>

            {/* Parlay Vaults Table */}
            <div className="relative rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>APR</TableHead>
                    <TableHead>TVL</TableHead>
                    <TableHead>Your Deposit</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parlayVaults.map((vault, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {truncateAddress(vault.account)}
                        </span>
                      </TableCell>
                      <TableCell>{formatAPR(vault.apr)}</TableCell>
                      <TableCell>{formatCurrency(vault.tvl)} USDe</TableCell>
                      <TableCell>
                        {formatCurrency(vault.yourDeposit)} USDe
                      </TableCell>
                      <TableCell>{vault.age} days</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs font-normal"
                        >
                          Deposit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Coming Soon Overlay */}
              <ComingSoonOverlay />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultsPage;
