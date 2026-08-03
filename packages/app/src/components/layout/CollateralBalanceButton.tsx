'use client';

import Image from 'next/image';
import { useAccount } from 'wagmi';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { formatDollarLikeBalance } from '~/lib/format/balance';

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
}

export default function CollateralBalanceButton({
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { address } = useAccount();
  const chainId = DEFAULT_CHAIN_ID;

  const { balance, symbol } = useCollateralBalance({ address, chainId });

  return (
    <div
      className={`flex w-fit mx-3 xl:mx-0 mt-0 items-center gap-2 ${className ?? ''}`}
    >
      <HoverCard openDelay={100} closeDelay={200}>
        <HoverCardTrigger>
          <div
            className={`inline-flex items-center rounded-md h-9 px-3 justify-start gap-2 bg-brand-black text-brand-white border border-ethena/40 hover:bg-brand-black/90 font-mono shadow-[0_0_12px_rgba(136,180,245,0.3)] hover:shadow-[0_0_18px_rgba(136,180,245,0.5)] transition-shadow cursor-default text-sm ${buttonClassName ?? ''}`}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/usde.svg"
                alt="USDe"
                width={20}
                height={20}
                className="opacity-90 ml-[-2px] w-5 h-5"
              />
              <span className="relative top-[1px] xl:top-0 text-sm font-normal">
                {formatDollarLikeBalance(balance)} {symbol}
              </span>
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" className="w-auto p-4">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="space-y-1 text-center">
              <p className="font-medium text-sm whitespace-nowrap">
                Wallet Balance
              </p>
              {address && (
                <div className="flex justify-center">
                  <AddressDisplay address={address} compact />
                </div>
              )}
              <p className="text-2xl font-mono pt-1">
                {formatDollarLikeBalance(balance)} {symbol}
              </p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
