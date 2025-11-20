'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { useReadContract, useBalance } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';

interface CollateralBalanceButtonProps {
  onClick?: () => void;
  className?: string;
  buttonClassName?: string;
}

export default function CollateralBalanceButton({
  onClick,
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';

  const accountAddress = connectedWallet?.address as `0x${string}` | undefined;

  // Determine if we should use native balance (for Ethereal chains) or ERC20 token
  const isEtherealChain =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;

  // Native balance for Ethereal chains
  const { data: nativeBalance } = useBalance({
    address: accountAddress,
    chainId,
    query: { enabled: Boolean(accountAddress) && isEtherealChain },
  });

  // ERC20 token balance for other chains
  const collateralAssetAddress = DEFAULT_COLLATERAL_ASSET;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'decimals',
    chainId,
    query: { enabled: Boolean(accountAddress) && !isEtherealChain },
  });

  const { data: tokenBalance } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress] : undefined,
    chainId,
    query: { enabled: Boolean(accountAddress) && !isEtherealChain },
  });

  const formattedBalance = useMemo(() => {
    try {
      if (isEtherealChain) {
        // Use native balance for Ethereal chains
        if (!nativeBalance) return `0 ${collateralSymbol}`;
        const num = Number(nativeBalance.formatted);
        if (Number.isNaN(num)) return `0 ${collateralSymbol}`;
        return `${formatFiveSigFigs(num)} ${collateralSymbol}`;
      } else {
        // Use ERC20 token balance for other chains
        const dec =
          typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
        if (!tokenBalance) return `0 ${collateralSymbol}`;
        const human = formatUnits(tokenBalance, dec);
        const num = Number(human);
        if (Number.isNaN(num)) return `0 ${collateralSymbol}`;
        return `${formatFiveSigFigs(num)} ${collateralSymbol}`;
      }
    } catch {
      return `0 ${collateralSymbol}`;
    }
  }, [
    isEtherealChain,
    nativeBalance,
    tokenBalance,
    decimals,
    collateralSymbol,
  ]);

  return (
    <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="outline"
              size="xs"
              className={`rounded-md h-9 px-3 min-w-[122px] justify-start gap-2 bg-brand-black text-brand-white border border-brand-white/10 hover:bg-brand-black/90 font-mono ${buttonClassName ?? ''}`}
              onClick={onClick}
            >
              <div className="flex items-stretch justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Image
                    src="/usde.svg"
                    alt="USDe"
                    width={20}
                    height={20}
                    className="opacity-90 ml-[-2px] w-5 h-5"
                  />
                  <span className="relative top-[1px] md:top-0 text-sm font-normal">
                    {formattedBalance}
                  </span>
                </div>
                <div className="inline-flex items-center ml-1 w-fit -mr-1">
                  <Badge
                    variant="outline"
                    className="rounded-md border-ethena/80 bg-ethena/20 font-normal text-xs h-5 flex items-center px-2 tracking-[0.08em] shadow-[0_0_10px_rgba(136,180,245,0.25)]"
                  >
                    5% APY
                  </Badge>
                </div>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>
              Join{' '}
              <a
                href="https://discord.gg/sapience"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Discord
              </a>{' '}
              to request {collateralSymbol}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
