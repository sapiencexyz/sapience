'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Trophy, ArrowRight, Info, Loader2 } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { Badge } from '~/components/ui/badge';
import { useResources } from '~/lib/hooks/useResources';
import NumberDisplay from '../../components/numberDisplay';

// Types
interface LeaderboardEntry {
  owner: string;
  totalPnL: number;
  ownerMaxCollateral: number;
  marketId: string;
  epochId: string;
  resourceName?: string;
  resourceIcon?: string;
}

interface Resource {
  id: number;
  name: string;
  iconPath: string;
  slug: string;
}

const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const LeaderboardCard = ({ entry, rank }: { entry: LeaderboardEntry; rank: number }) => {
  const roi = entry.totalPnL / (entry.ownerMaxCollateral || 1);
  const isPositive = entry.totalPnL > 0;
  
  return (
    <Card className="mb-4 overflow-hidden hover:border-primary/50 transition-all">
      <CardContent className="p-0">
        <div className="flex items-center p-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary mr-4">
            <span className="text-xl font-bold">{rank}</span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium">{formatAddress(entry.owner)}</h3>
              {entry.resourceName && (
                <Badge variant="outline" className="ml-2">
                  <div className="flex items-center gap-1">
                    <Image 
                      src={entry.resourceIcon || '/icons/icon-512x512.png'} 
                      alt={entry.resourceName} 
                      width={14} 
                      height={14} 
                      className="rounded-full"
                    />
                    <span className="text-xs">{entry.resourceName}</span>
                  </div>
                </Badge>
              )}
            </div>
            
            <div className="flex items-center mt-1 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">ROI</span>
                <div className={`font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}<NumberDisplay value={roi * 100} /> %
                </div>
              </div>
              
              <div>
                <span className="text-sm text-muted-foreground">P/L</span>
                <div className={`font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}<NumberDisplay value={entry.totalPnL / 1e18} /> wstETH
                </div>
              </div>
            </div>
          </div>
          
          <Link href={`/leaderboard/${entry.marketId}/epochs/${entry.epochId}`}>
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Trophy className="h-16 w-16 opacity-20 mb-4" />
    <h3 className="text-xl font-medium mb-2">No leaderboard data available</h3>
    <p className="text-muted-foreground max-w-md">
      Leaderboard data will appear here once traders start participating in prediction markets.
    </p>
  </div>
);

const LeaderboardPage = () => {
  const [selectedResource, setSelectedResource] = useState<string>('all');
  const { data: resources } = useResources();
  
  // Placeholder data
  const leaderboardData: LeaderboardEntry[] = [
    {
      owner: '0x1234...5678',
      totalPnL: 1.5e18,
      ownerMaxCollateral: 10e18,
      marketId: '1:0xabc',
      epochId: '123',
      resourceName: 'ETH Price',
      resourceIcon: '/icons/icon-512x512.png'
    },
    {
      owner: '0x8765...4321',
      totalPnL: -0.5e18,
      ownerMaxCollateral: 5e18,
      marketId: '1:0xdef',
      epochId: '124',
      resourceName: 'BTC Price',
      resourceIcon: '/icons/icon-512x512.png'
    }
  ];

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-light mb-2">Leaderboard</h1>
          <p className="text-muted-foreground">
            Top performers across all prediction markets, ranked by return on investment.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-[180px]">
            <Select value={selectedResource} onValueChange={setSelectedResource}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {resources?.map((resource) => (
                  <SelectItem key={resource.id} value={resource.slug}>
                    {resource.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Leaderboard rankings are based on Return on Investment (ROI) calculated from trading performance.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="col-span-1 md:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>
              Traders with the highest ROI
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardData.length > 0 ? (
              <div className="h-[600px] pr-4 overflow-auto">
                {leaderboardData.map((entry, index) => (
                  <LeaderboardCard 
                    key={`${entry.owner}-${entry.marketId}`} 
                    entry={entry} 
                    rank={index + 1} 
                  />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
        
        <div className="col-span-1">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Hall of Fame</CardTitle>
              <CardDescription>All-time best performers</CardDescription>
            </CardHeader>
            <CardContent>
              {leaderboardData.length > 0 ? (
                <div className="space-y-4">
                  {leaderboardData.slice(0, 3).map((entry, index) => (
                    <div key={`fame-${entry.owner}`} className="flex items-center">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary mr-3">
                        {index === 0 ? (
                          <Trophy className="h-4 w-4 text-amber-400" />
                        ) : (
                          <span className="text-sm font-bold">{index + 1}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{formatAddress(entry.owner)}</div>
                        <div className="text-sm text-muted-foreground">
                          ROI: <span className="text-green-500">+<NumberDisplay value={(entry.totalPnL / (entry.ownerMaxCollateral || 1)) * 100} />%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Prediction Market Stats</CardTitle>
              <CardDescription>Performance by prediction market</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resources?.slice(0, 5).map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Image 
                        src={resource.iconPath} 
                        alt={resource.name} 
                        width={20} 
                        height={20} 
                        className="rounded-full"
                      />
                      <span>{resource.name}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">0 traders</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="my-4">
                <Separator />
              </div>
              
              <Link href="/markets">
                <Button variant="outline" className="w-full">
                  View All Prediction Markets
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPage; 