'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { Button } from '@sapience/ui/components/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Gift, Info } from 'lucide-react';
import {
  parseEther,
  encodeFunctionData,
  parseAbi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';
import { useSwitchChain } from 'wagmi';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { formatUnits } from 'viem';
import { useFundDialog } from '~/lib/context/FundDialogContext';
import SponsorshipBadge from '~/components/shared/SponsorshipBadge';
import BridgeProgressBadge from '~/components/layout/BridgeProgressBadge';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';
import {
  executeSudoTransaction,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useSponsorStatus } from '~/hooks/sponsorship/useSponsorStatus';

const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
}

/**
 * Formats a balance with commas and exactly 2 decimal places.
 * e.g. 1234.567 → "1,234.57", 100 → "100.00", 62.9 → "62.90"
 */
function formatDollarLikeBalance(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CollateralBalanceButton({
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { address: eoaAddress, connector } = useAccount();
  const chainId = DEFAULT_CHAIN_ID;
  const wusdeAddress = collateralToken[chainId]?.address;

  // Get smart account address and mode from session context
  const { smartAccountAddress, isCalculatingAddress, isUsingSmartAccount } =
    useSession();

  // Get EOA balance (connected wallet)
  const {
    balance: eoaBalance,
    nativeBalance: eoaNativeBalance,
    wrappedBalance: eoaWrappedBalance,
    rawWrappedBalance: rawEoaWrappedBalance,
    symbol,
    refetch: refetchEoaBalance,
  } = useCollateralBalance({
    address: eoaAddress,
    chainId,
  });

  // Get smart account balance
  const {
    balance: smartAccountBalance,
    nativeBalance: smartAccountNativeBalance,
    wrappedBalance: smartAccountWrappedBalance,
    rawNativeBalance: rawSmartAccountNativeBalance,
    rawWrappedBalance: rawSmartAccountWrappedBalance,
    isLoading: isSmartAccountBalanceLoading,
    refetch: refetchSmartAccountBalance,
  } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId,
    enabled: Boolean(smartAccountAddress),
  });

  // Sponsorship budget
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
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const { toast } = useToast();

  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  // Unwrap any wUSDe sitting on the EOA. Stargate / most onward flows expect
  // native USDe, and the SA-side unwrap doesn't help with stray wrapped that
  // arrived via someone else's transfer or a prior session.
  const handleUnwrapEoa = async () => {
    if (!eoaAddress || rawEoaWrappedBalance === 0n) return;
    setIsUnwrapping(true);
    try {
      await switchChainAsync({ chainId: DEFAULT_CHAIN_ID });
      await sendTransactionAsync({
        chainId: DEFAULT_CHAIN_ID,
        to: wusdeAddress,
        data: encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'withdraw',
          args: [rawEoaWrappedBalance],
        }),
        value: 0n,
      });
      toast({
        title: 'Unwrapped',
        description: `${formatDollarLikeBalance(eoaWrappedBalance)} wUSDe → ${symbol}`,
        duration: 5000,
      });
      setTimeout(() => refetchEoaBalance(), 3000);
    } catch (error: unknown) {
      const err = error as { shortMessage?: string; message?: string };
      toast({
        title: 'Unwrap failed',
        description: err.shortMessage || err.message || 'Failed to unwrap',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsUnwrapping(false);
    }
  };

  // Withdraw validation — covers both wrapped and native USDe in the smart
  // account, since the UserOp can unwrap atomically before transferring native
  // out to the EOA.
  const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
  const maxWithdrawable =
    smartAccountNativeBalance + smartAccountWrappedBalance;
  const isValidWithdraw =
    withdrawAmountNum > 0 && withdrawAmountNum <= maxWithdrawable;

  // Prefill the input with the user's max withdrawable when the dialog opens.
  useEffect(() => {
    if (!isWithdrawOpen) return;
    if (maxWithdrawable > 0) {
      const floored = Math.floor(maxWithdrawable * 100) / 100;
      setWithdrawAmount(floored > 0 ? floored.toString() : '');
    }
  }, [isWithdrawOpen, maxWithdrawable]);

  // Handle withdraw from smart account
  const handleWithdraw = async () => {
    if (!smartAccountAddress || !eoaAddress || !isValidWithdraw) {
      let description = 'Wallet not connected';
      if (!smartAccountAddress) {
        description = 'Smart account address not available';
      } else if (!isValidWithdraw) {
        description = 'Invalid withdraw amount';
      }
      toast({
        title: 'Cannot withdraw',
        description,
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    if (!connector) {
      toast({
        title: 'Cannot withdraw',
        description: 'Wallet not connected',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setIsWithdrawLoading(true);
    setWithdrawStatus('Requesting signature...');

    try {
      const requestedAmount = parseEther(withdrawAmountNum.toString());
      const rawMax =
        rawSmartAccountNativeBalance + rawSmartAccountWrappedBalance;
      // Float→wei rounding can push the requested value 1 wei over the actual
      // balance when the user picks the "max" amount. Clamp so we never try
      // to unwrap or send more than the SA holds.
      const amount = requestedAmount > rawMax ? rawMax : requestedAmount;

      // Spend native USDe first; only unwrap as much wUSDe as needed to cover
      // the rest. This minimizes calls when the smart account already has
      // native funds sitting alongside wrapped.
      const fromNative =
        amount <= rawSmartAccountNativeBalance
          ? amount
          : rawSmartAccountNativeBalance;
      const fromWrapped = amount - fromNative;

      const calls: { to: Address; data: Hex; value: bigint }[] = [];
      if (fromWrapped > 0n) {
        calls.push({
          to: wusdeAddress,
          data: encodeFunctionData({
            abi: WUSDE_ABI,
            functionName: 'withdraw',
            args: [fromWrapped],
          }),
          value: 0n,
        });
      }
      // Native USDe transfer — bare value send, no calldata.
      calls.push({
        to: eoaAddress,
        data: '0x',
        value: amount,
      });

      // Create owner signer from connector
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const ownerSigner: OwnerSigner = {
        address: eoaAddress,
        provider,
        switchChain: async (targetChainId: number) => {
          await switchChainAsync({ chainId: targetChainId });
        },
      };

      setWithdrawStatus('Confirm in wallet...');

      // Execute via sudo transaction (requires wallet signature). All calls
      // bundle into one paymaster-sponsored UserOp — atomic unwrap + transfer.
      await executeSudoTransaction(ownerSigner, calls, DEFAULT_CHAIN_ID);

      setWithdrawStatus('');
      toast({
        title: 'Withdraw Successful',
        description: `${formatDollarLikeBalance(withdrawAmountNum)} ${symbol} sent to ${eoaAddress.slice(0, 6)}...${eoaAddress.slice(-4)}`,
        duration: 5000,
      });

      setTimeout(() => {
        refetchEoaBalance();
        refetchSmartAccountBalance();
      }, 3000);
    } catch (error: unknown) {
      console.error('Withdraw failed:', error);
      setWithdrawStatus('');
      toast({
        title: 'Withdrawal failed',
        description: (error as Error)?.message || 'Failed to withdraw USDe',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsWithdrawLoading(false);
    }
  };

  // Display the balance based on the current mode
  const displayedBalance = isUsingSmartAccount
    ? smartAccountBalance
    : eoaBalance;

  // Show FUND ACCOUNT button when in smart account mode with zero balance (and not still loading)
  // If the user has a sponsorship, show the balance display with gift icon instead
  // Also wait for sponsor status to load to avoid flashing "Fund Account"
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
              {/* Left section - Get USDe */}
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
                {/* Withdraw button shown when smart account has balance, regardless of mode */}
                {/* This allows users to recover funds from smart account even when using EOA */}
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

      {/* Withdraw Dialog */}
      <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Withdraw to Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Funds land as native {symbol} in your wallet on Ethereal, ready to
              bridge out via{' '}
              <a
                href="https://stargate.finance/?srcChain=ethereal&srcToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
                target="_blank"
                rel="noopener noreferrer"
                className="gold-link font-medium"
              >
                Stargate
              </a>
              .
            </p>

            {/* Two stacked step cards. Each pairs an account (Sapience for
                step 1, Ethereal wallet for step 2) with the action that
                operates on it, so the account context reads as part of
                the step rather than as a separate "from → to" diagram. */}
            <div className="space-y-3">
              {/* Step 1 — Withdraw from Sapience */}
              <div className="rounded-lg border border-ethena/40 bg-brand-black p-4 space-y-3 shadow-[0_0_12px_rgba(136,180,245,0.15)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                      Step 1 — Withdraw to wallet
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        From Sapience Account
                      </span>
                      {isCalculatingAddress ? (
                        <span className="font-mono text-muted-foreground">
                          Calculating...
                        </span>
                      ) : smartAccountAddress ? (
                        <span className="flex items-center gap-1">
                          <EnsAvatar
                            address={smartAccountAddress}
                            width={14}
                            height={14}
                          />
                          <AddressDisplay
                            address={smartAccountAddress}
                            compact
                          />
                        </span>
                      ) : (
                        <span className="font-mono text-muted-foreground">
                          Not available
                        </span>
                      )}
                    </div>
                  </div>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="text-right cursor-default shrink-0">
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="font-mono text-lg font-medium text-brand-white">
                            {formatDollarLikeBalance(smartAccountBalance)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {symbol}
                          </span>
                        </div>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="w-auto p-3">
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Native USDe
                          </span>
                          <span className="font-mono">
                            {formatDollarLikeBalance(smartAccountNativeBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Wrapped USDe
                          </span>
                          <span className="font-mono">
                            {formatDollarLikeBalance(
                              smartAccountWrappedBalance
                            )}
                          </span>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <Input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-11 text-lg font-mono flex-1"
                    disabled={isWithdrawLoading}
                  />
                  <Button
                    className="h-11 px-4 shrink-0"
                    onClick={handleWithdraw}
                    disabled={
                      isWithdrawLoading ||
                      !smartAccountAddress ||
                      !isValidWithdraw
                    }
                  >
                    {isWithdrawLoading
                      ? withdrawStatus || 'Processing...'
                      : 'Withdraw'}
                  </Button>
                </div>
              </div>

              {/* Step 2 — Bridge from Ethereal wallet via Stargate */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                      Step 2 — Bridge to another chain
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        From Ethereal wallet
                      </span>
                      {eoaAddress ? (
                        <span className="flex items-center gap-1">
                          <EnsAvatar
                            address={eoaAddress}
                            width={14}
                            height={14}
                          />
                          <AddressDisplay address={eoaAddress} compact />
                        </span>
                      ) : (
                        <span className="font-mono text-muted-foreground">
                          Not connected
                        </span>
                      )}
                    </div>
                  </div>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="text-right cursor-default shrink-0">
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="font-mono text-lg font-medium">
                            {formatDollarLikeBalance(eoaBalance)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {symbol}
                          </span>
                        </div>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="w-auto p-3">
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Native USDe
                          </span>
                          <span className="font-mono">
                            {formatDollarLikeBalance(eoaNativeBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Wrapped USDe
                          </span>
                          <span className="font-mono">
                            {formatDollarLikeBalance(eoaWrappedBalance)}
                          </span>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="pt-2 border-t border-border/30 space-y-2">
                  {/* If wUSDe is sitting on the EOA, surface a one-click
                      unwrap so users can hand Stargate native USDe. */}
                  {eoaWrappedBalance > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                      <span className="text-amber-400">
                        {formatDollarLikeBalance(eoaWrappedBalance)} wUSDe in
                        wallet — unwrap before bridging.
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs shrink-0"
                        onClick={handleUnwrapEoa}
                        disabled={isUnwrapping}
                      >
                        {isUnwrapping ? 'Unwrapping…' : 'Unwrap'}
                      </Button>
                    </div>
                  )}
                  <Button className="h-11 w-full" asChild>
                    <a
                      href="https://stargate.finance/?srcChain=ethereal&srcToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Stargate
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
