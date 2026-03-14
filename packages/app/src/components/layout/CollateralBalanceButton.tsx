'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useAccount, useSendCalls } from 'wagmi';
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
import { ArrowRight, Gift, Info } from 'lucide-react';
import SponsorshipBadge from '~/components/shared/SponsorshipBadge';
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
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';
import {
  executeSudoTransaction,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';
import { STARGATE_DEPOSIT_URL } from '~/lib/constants';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useSwitchChain } from 'wagmi';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { useSponsorStatus } from '~/hooks/sponsorship/useSponsorStatus';
import { formatUnits } from 'viem';

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

  const [isGetUsdeOpen, setIsGetUsdeOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isTransferLoading, setIsTransferLoading] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const { toast } = useToast();

  // useSendCalls for batching wrap + transfer (with fallback for wallets like Rabby)
  const { sendCallsAsync, isPending: isSendingCalls } = useSendCalls();

  const { switchChainAsync } = useSwitchChain();

  // Calculate max transferable amount (wrapped + native)
  const maxTransferable = eoaWrappedBalance + eoaNativeBalance;

  // Parse transfer amount and calculate allocation (use wrapped first, then native)
  const transferAmountNum = parseFloat(transferAmount) || 0;
  const fromWrapped = Math.min(transferAmountNum, eoaWrappedBalance);
  const fromNative = Math.min(
    Math.max(0, transferAmountNum - eoaWrappedBalance),
    eoaNativeBalance
  );
  const isValidTransfer =
    transferAmountNum > 0 && transferAmountNum <= maxTransferable;

  // Set max amount when dialog opens (use floor to avoid exceeding balance)
  useEffect(() => {
    if (isGetUsdeOpen && maxTransferable > 0) {
      // Floor to 2 decimals to ensure we never transfer more than available
      const floored = Math.floor(maxTransferable * 100) / 100;
      setTransferAmount(floored > 0 ? floored.toString() : '');
    }
  }, [isGetUsdeOpen, maxTransferable]);

  // Handle transfer from wallet using sendCalls for batched wrap + transfer
  const handleTransferFromWallet = async () => {
    if (!smartAccountAddress || !eoaAddress || !isValidTransfer) {
      let description = 'Wallet not connected';
      if (!smartAccountAddress) {
        description = 'Smart account address not available';
      } else if (!isValidTransfer) {
        description = 'Invalid transfer amount';
      }
      toast({
        title: 'Cannot transfer',
        description,
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setIsTransferLoading(true);
    setTransferStatus('Switching to Ethereal...');

    try {
      // Switch to Ethereal chain first
      await switchChainAsync({ chainId: DEFAULT_CHAIN_ID });

      setTransferStatus('Preparing transaction...');

      // Build the calls array for batched execution
      const calls: { to: `0x${string}`; data: `0x${string}`; value: bigint }[] =
        [];

      // Compute amounts in wei using raw BigInts to avoid float precision loss
      const transferAmountWei = parseEther(transferAmount || '0');
      const fromWrappedWei =
        transferAmountWei <= rawEoaWrappedBalance
          ? transferAmountWei
          : rawEoaWrappedBalance;
      const fromNativeWei = transferAmountWei - fromWrappedWei;

      // If we need to wrap native USDe, add wrap call first
      if (fromNativeWei > 0n) {
        const wrapData = encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        });

        calls.push({
          to: wusdeAddress,
          data: wrapData,
          value: fromNativeWei,
        });
      }

      // Add transfer call (transfer the full requested amount as wUSDe)
      const transferData = encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'transfer',
        args: [smartAccountAddress, transferAmountWei],
      });

      calls.push({
        to: wusdeAddress,
        data: transferData,
        value: 0n,
      });

      setTransferStatus(
        fromNative > 0 ? 'Wrapping & transferring...' : 'Transferring...'
      );

      // Execute batched calls with experimental fallback for wallets like Rabby
      await sendCallsAsync({
        chainId: DEFAULT_CHAIN_ID,
        calls,
        // Enable fallback for wallets that don't support EIP-5792
        experimental_fallback: true,
      } as Parameters<typeof sendCallsAsync>[0]);

      setTransferStatus('');
      toast({
        title: 'Transfer successful',
        description: `This will be reflected in the app shortly.`,
        duration: 5000,
      });

      // Refetch balances after a delay
      setTimeout(() => {
        refetchEoaBalance();
        refetchSmartAccountBalance();
      }, 5000);
    } catch (error: unknown) {
      console.error('Transfer failed:', error);
      setTransferStatus('');
      toast({
        title: 'Transfer failed',
        description: (error as Error)?.message || 'Failed to transfer USDe',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsTransferLoading(false);
    }
  };

  // Withdraw validation
  const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
  const maxWithdrawable = smartAccountWrappedBalance; // Can only withdraw wrapped balance
  const isValidWithdraw =
    withdrawAmountNum > 0 && withdrawAmountNum <= maxWithdrawable;

  // Set max withdraw amount when dialog opens
  useEffect(() => {
    if (isWithdrawOpen && maxWithdrawable > 0) {
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
      const amount = parseEther(withdrawAmountNum.toString());

      // Transfer wUSDe directly to EOA (user can unwrap on their own if needed)
      // This is a single call that can be sponsored by the paymaster
      const calls: { to: Address; data: Hex; value: bigint }[] = [
        {
          to: wusdeAddress,
          data: encodeFunctionData({
            abi: WUSDE_ABI,
            functionName: 'transfer',
            args: [eoaAddress, amount],
          }),
          value: 0n,
        },
      ];

      // Create owner signer from connector
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const ownerSigner: OwnerSigner = {
        address: eoaAddress,
        provider,
        switchChain: async (chainId: number) => {
          await switchChainAsync({ chainId });
        },
      };

      setWithdrawStatus('Confirm in wallet...');

      // Execute via sudo transaction (requires wallet signature)
      await executeSudoTransaction(ownerSigner, calls, DEFAULT_CHAIN_ID);

      setWithdrawStatus('');
      toast({
        title: 'Withdraw Successful',
        description: `${formatDollarLikeBalance(withdrawAmountNum)} wUSDe transferred to ${eoaAddress.slice(0, 6)}...${eoaAddress.slice(-4)}`,
        duration: 5000,
      });

      // Close dialog and refetch balances
      setIsWithdrawOpen(false);
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
    <div className={`flex w-fit mx-3 xl:mx-0 mt-0 ${className ?? ''}`}>
      {showFundButton ? (
        <button
          type="button"
          onClick={() => setIsGetUsdeOpen(true)}
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
                  onClick={() => setIsGetUsdeOpen(true)}
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
                    Withdraw from Sapience Account
                  </button>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}

      {/* Get USDe Dialog */}
      <Dialog open={isGetUsdeOpen} onOpenChange={setIsGetUsdeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Fund Your Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
              <li>
                <a
                  href="https://www.bungee.exchange/?fromChainId=1&fromTokenAddress=0x4c9edd5852cd905f086c759e8383e09bff1e68b3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gold-link"
                >
                  Get USDe
                </a>
              </li>
              <li>
                <a
                  href={STARGATE_DEPOSIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gold-link"
                >
                  Bridge to Ethereal
                </a>
              </li>
              <li className="text-brand-white">
                Transfer to your Sapience Account
              </li>
            </ul>

            {/* Two Account Cards */}
            <div className="flex items-stretch gap-3">
              {/* Ethereal Account Card */}
              <div className="flex-1 rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Ethereal Account
                  </p>
                  {eoaAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar address={eoaAddress} width={16} height={16} />
                      <AddressDisplay address={eoaAddress} compact />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">
                      Not connected
                    </span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-baseline gap-1.5 cursor-default">
                        <span className="font-mono text-lg font-medium">
                          {formatDollarLikeBalance(eoaBalance)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {symbol}
                        </span>
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
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center px-1">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Sapience Account Card */}
              <div className="flex-1 rounded-lg border border-ethena/40 bg-brand-black p-4 space-y-3 shadow-[0_0_12px_rgba(136,180,245,0.15)]">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Sapience Account
                  </p>
                  {isCalculatingAddress ? (
                    <span className="font-mono text-sm text-muted-foreground">
                      Calculating...
                    </span>
                  ) : smartAccountAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar
                        address={smartAccountAddress}
                        width={16}
                        height={16}
                      />
                      <AddressDisplay address={smartAccountAddress} compact />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">
                      Not available
                    </span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-baseline gap-1.5 cursor-default">
                        <span className="font-mono text-lg font-medium text-brand-white">
                          {formatDollarLikeBalance(smartAccountBalance)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {symbol}
                        </span>
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
              </div>
            </div>

            {/* Transfer Input Section */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 text-lg font-mono pr-10"
                  disabled={isTransferLoading || isSendingCalls}
                />
                {transferAmountNum > 0 &&
                  (fromWrapped > 0 || fromNative > 0) && (
                    <HoverCard openDelay={100} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <span className="text-lg">USDe</span>
                          <Info className="h-4 w-4" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" className="w-auto p-3">
                        <div className="space-y-1.5 text-sm">
                          {fromWrapped > 0 && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Wrapped USDe
                              </span>
                              <span className="font-mono">
                                {formatDollarLikeBalance(fromWrapped)}
                              </span>
                            </div>
                          )}
                          {fromNative > 0 && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Native USDe (to wrap)
                              </span>
                              <span className="font-mono">
                                {formatDollarLikeBalance(fromNative)}
                              </span>
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )}
              </div>
              <Button
                className="h-11 px-4"
                onClick={handleTransferFromWallet}
                disabled={
                  isTransferLoading ||
                  isSendingCalls ||
                  !smartAccountAddress ||
                  !isValidTransfer
                }
              >
                {isTransferLoading || isSendingCalls
                  ? transferStatus || 'Processing...'
                  : 'Transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Withdraw USDe</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Withdraw USDe from your Sapience Account to your Ethereal Account.
            </p>

            {/* Two Account Cards (reversed from deposit) */}
            <div className="flex items-stretch gap-3">
              {/* Sapience Account Card */}
              <div className="flex-1 rounded-lg border border-ethena/40 bg-brand-black p-4 space-y-3 shadow-[0_0_12px_rgba(136,180,245,0.15)]">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Sapience Account
                  </p>
                  {isCalculatingAddress ? (
                    <span className="font-mono text-sm text-muted-foreground">
                      Calculating...
                    </span>
                  ) : smartAccountAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar
                        address={smartAccountAddress}
                        width={16}
                        height={16}
                      />
                      <AddressDisplay address={smartAccountAddress} compact />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">
                      Not available
                    </span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-baseline gap-1.5 cursor-default">
                        <span className="font-mono text-lg font-medium text-brand-white">
                          {formatDollarLikeBalance(smartAccountBalance)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {symbol}
                        </span>
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
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center px-1">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Ethereal Account Card */}
              <div className="flex-1 rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Ethereal Account
                  </p>
                  {eoaAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar address={eoaAddress} width={16} height={16} />
                      <AddressDisplay address={eoaAddress} compact />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">
                      Not connected
                    </span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-baseline gap-1.5 cursor-default">
                        <span className="font-mono text-lg font-medium">
                          {formatDollarLikeBalance(eoaBalance)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {symbol}
                        </span>
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
              </div>
            </div>

            {/* Withdraw Input Section */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 text-lg font-mono"
                  disabled={isWithdrawLoading}
                />
              </div>
              <Button
                className="h-11 px-4"
                onClick={handleWithdraw}
                disabled={
                  isWithdrawLoading || !smartAccountAddress || !isValidWithdraw
                }
              >
                {isWithdrawLoading
                  ? withdrawStatus || 'Processing...'
                  : 'Withdraw'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
