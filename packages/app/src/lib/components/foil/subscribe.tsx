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

const Subscribe: FC<SubscribeProps> = ({
  marketAddress: propMarketAddress,
  chainId: propChainId,
  epoch: propEpoch,
  showMarketSwitcher = false,
}) => {
  const { address } = useAccount();
  const { markets } = useMarketList();

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <h2 className="text-lg font-medium">Connect your wallet</h2>
        <p className="text-sm text-muted-foreground">
          Connect your wallet to view and manage subscriptions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Subscribe to Market</h2>
      {/* Add your subscription form or market selection UI here */}
    </div>
  );
};

export default Subscribe;
