'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@sapience/ui/components/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import { Gift, Info } from 'lucide-react';
import { formatUnits } from 'viem';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { useFundDialog } from '~/lib/context/FundDialogContext';
import SponsorshipBadge from '~/components/shared/SponsorshipBadge';
import BridgeProgressBadge from '~/components/layout/BridgeProgressBadge';
import WithdrawDialog from '~/components/layout/WithdrawDialog';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { useSponsorStatus } from '~/hooks/sponsorship/useSponsorStatus';
import { formatDollarLikeBalance } from '~/lib/format/balance';

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
}

export default function CollateralBalanceButton({
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { address: eoaAddress } = useAccount();
  const chainId = DEFAULT_CHAIN_ID;

  const { smartAccountAddress, isUsingSmartAccount } = useSession();

  const { balance: eoaBalance, symbol } = useCollateralBalance({
    address: eoaAddress,
    chainId,
  });

  const {
    balance: smartAccountBalance,
    isLoading: isSmartAccountBalanceLoading,
  } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId,
    enabled: Boolean(smartAccountAddress),
  });

  const {
    isSponsored,
    remainingBudget,
    isLoading: isSponsorLoading,
  } = useSponsorStatus();
  const sponsorBudgetFormatted = isSponsored
    ? formatDollarLikeBalance(formatUnits(remainingBudget, 18))
    : '0.00';

  const { openFundDialog } = useFundDialog();
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const displayedBalance = isUsingSmartAccount
    ? smartAccountBalance
    : eoaBalance;

  // Show FUND ACCOUNT button when in smart account mode with zero balance (and
  // not still loading). If the user has a sponsorship, show the balance display
  // with gift icon instead. Wait for sponsor status to load to avoid flashing.
  const showFundButton =
    isUsingSmartAccount &&
    smartAccountBalance === 0 &&
    !isSmartAccountBalanceLoading &&
    !isSponsored &&
    !isSponsorLoading;

  return (
    <div
      className={`flex w-fit mx-3 xl:mx-0 mt-0 items-center gap-2 ${className ?? ''}`}
    >
      {showFundButton ? (
        <button
          type="button"
          onClick={openFundDialog}
          className={`btn-get-access inline-flex items-center rounded-md h-10 xl:h-9 px-4 justify-center text-brand-black hover:text-white font-semibold border-0 transition-colors duration-400 font-mono uppercase tracking-widest text-sm ${buttonClassName ?? ''}`}
        >
          <span className="relative z-10">Fund Account</span>
        </button>
      ) : (
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
                  {formatDollarLikeBalance(displayedBalance)} {symbol}
                </span>
                {isSponsored && <SponsorshipBadge />}
              </div>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" className="w-auto p-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="space-y-1 text-center">
                  <p className="font-medium text-sm whitespace-nowrap">
                    {isUsingSmartAccount
                      ? 'Sapience Account Balance'
                      : 'Wallet Balance'}
                  </p>
                  {isUsingSmartAccount && smartAccountAddress && (
                    <div className="flex justify-center">
                      <AddressDisplay address={smartAccountAddress} compact />
                    </div>
                  )}
                  {!isUsingSmartAccount && eoaAddress && (
                    <div className="flex justify-center">
                      <AddressDisplay address={eoaAddress} compact />
                    </div>
                  )}
                  <p className="text-2xl font-mono pt-1">
                    {formatDollarLikeBalance(displayedBalance)} {symbol}
                  </p>
                </div>
                {isSponsored && (
                  <div className="w-full rounded-md border border-ethena/30 bg-ethena/10 px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 text-ethena font-medium">
                      <Gift className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {sponsorBudgetFormatted} {symbol} sponsorship available
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-ethena/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[220px] text-xs text-center"
                        >
                          Available for positions quoted &lt;70% chance against
                          the vault.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  className="gap-2 w-full"
                  onClick={openFundDialog}
                >
                  <Image
                    src="/usde.svg"
                    alt="USDe"
                    width={16}
                    height={16}
                    className="opacity-90"
                  />
                  Get USDe
                </Button>
                {/* Withdraw is shown whenever the smart account holds funds —
                    available in both wallet and smart-account modes so users
                    can recover funds regardless of which mode they're in. */}
                {smartAccountBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsWithdrawOpen(true)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Withdraw from Sapience
                  </button>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}

      <BridgeProgressBadge />

      <WithdrawDialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen} />
    </div>
  );
}
