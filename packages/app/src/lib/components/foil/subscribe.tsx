'use client';

/* eslint-disable sonarjs/cognitive-complexity */

import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import {
  formatDuration,
  intervalToDuration,
  format,
  formatDistanceToNow,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown,
  ChartNoAxesColumn,
  ChevronLeft,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FC, useState, useEffect, useContext, useMemo } from 'react';
import React from 'react';
import CountUp from 'react-countup';
import { useForm } from 'react-hook-form';
import type { AbiFunction } from 'viem';
import {
  decodeEventLog,
  formatUnits,
  zeroAddress,
  isAddress,
  createPublicClient,
  http,
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
  useConnect,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import { API_BASE_URL } from '~/lib/constants/constants';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';

import NumberDisplay from './numberDisplay';
import SimpleBarChart from './SimpleBarChart';
import SizeInput from './sizeInput';

interface SubscribeProps {
  marketAddress?: string;
  chainId?: number;
  epoch?: number;
  showMarketSwitcher?: boolean;
}

const publicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

const SUBSCRIPTIONS_QUERY = gql`
  query GetSubscriptions($owner: String!) {
    positions(owner: $owner) {
      id
      positionId
      isLP
      baseToken
      quoteToken
      borrowedBaseToken
      borrowedQuoteToken
      collateral
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        market {
          id
          chainId
          address
          name
        }
      }
      transactions {
        id
        timestamp
        type
      }
    }
  }
`;

const Subscribe: FC<SubscribeProps> = ({
  marketAddress: propMarketAddress,
  chainId: propChainId,
  epoch: propEpoch,
  showMarketSwitcher = false,
}) => {
  const { address } = useAccount();
  const { markets } = useMarketList();

  const { data: positions, isLoading } = useQuery({
    queryKey: ['subscriptions', address],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: SUBSCRIPTIONS_QUERY,
          variables: {
            owner: address?.toLowerCase(),
          },
        }),
      });

      const { data, errors } = await response.json();
      if (errors) {
        throw new Error(errors[0].message);
      }

      // Filter for active long positions
      return data.positions.filter(
        (position: any) =>
          !position.isLP && // Not an LP position
          BigInt(position.baseToken) > BigInt(0) // Has positive baseToken
      );
    },
    enabled: !!address,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!positions?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <h2 className="text-lg font-medium">No active subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          Subscribe to a market to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Active Subscriptions</h2>
      <div className="grid gap-4">
        {positions.map((position: any) => (
          <Link
            key={position.id}
            href={`/${position.epoch.market.chainId}:${position.epoch.market.address}/${position.epoch.epochId}/${position.positionId}`}
            className="block space-y-2 rounded-lg border p-4 hover:bg-accent/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {position.epoch.market.name || 'Unnamed Market'}
              </span>
              <span className="text-sm text-muted-foreground">
                {position.epoch.endTimestamp
                  ? `Expires ${formatDistanceToNow(
                      position.epoch.endTimestamp * 1000,
                      { addSuffix: true }
                    )}`
                  : 'Expiry not set'}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              Position #{position.positionId}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Subscribe;
