'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/CreateMarketGroupForm';

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

  const accountAddress = connectedWallet?.address as `0x${string}` | undefined;

  const collateralAssetAddress = DEFAULT_COLLATERAL_ASSET as `0x${string}`;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'decimals',
    chainId: 42161,
    query: { enabled: Boolean(accountAddress) },
  });

  const { data: balance } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress] : undefined,
    chainId: 42161,
    query: { enabled: Boolean(accountAddress) },
  });

  const formattedBalance = useMemo(() => {
    try {
      const dec =
        typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
      if (!balance) return `0 testUSDe`;
      const human = formatUnits(balance, dec);
      const num = Number(human);
      if (Number.isNaN(num)) return `0 testUSDe`;
      return `${formatFiveSigFigs(num)} testUSDe`;
    } catch {
      return `0 testUSDe`;
    }
  }, [balance, decimals]);

  return (
    <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="outline"
              size="xs"
              className={`rounded-full h-9 px-3 min-w-[122px] justify-start gap-2 ${buttonClassName ?? ''}`}
              onClick={onClick}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Image
                    src="/usde.svg"
                    alt="USDe"
                    width={20}
                    height={20}
                    className="opacity-90 ml-[-2px] w-5 h-5"
                  />
                  <span className="relative top-[1px] md:top-0 text-sm">
                    {formattedBalance}
                  </span>
                </div>
                <div className="inline-flex ml-1 rounded-full w-fit shadow-[0_0_10px_rgba(136,180,245,0.25)] -mr-1">
                  <Badge
                    variant="outline"
                    className="rounded-full border-[#91B3F0]/80 bg-[#91B3F0]/20"
                  >
                    9% APY
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
              to request testUSDe
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
