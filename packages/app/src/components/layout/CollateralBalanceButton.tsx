'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
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
import { ArrowRight, Info } from 'lucide-react';
import { parseEther, toHex, encodeFunctionData, parseAbi } from 'viem';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { ethereal } from '~/lib/session/sessionKeyManager';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';
import { STARGATE_DEPOSIT_URL } from '~/lib/constants';
import { getPublicClientForChainId } from '~/lib/utils/util';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';

const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/**
 * Calculate time until next weekly distribution (every Monday at 00:00 UTC)
 */
function getNextDistributionCountdown(): string {
  const now = new Date();
  const nextMonday = new Date(now);

  // Find next Monday
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);

  const diff = nextMonday.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
}

/**
 * Formats a balance as dollar-like: max 2 decimal places, no trailing zeros.
 * e.g. 1234.567 → "1234.57", 100.00 → "100", 50.10 → "50.1"
 */
function formatDollarLikeBalance(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  // Round to 2 decimal places
  const rounded = Math.round(num * 100) / 100;

  // Format without trailing zeros
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function CollateralBalanceButton({
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { address: eoaAddress, connector } = useAccount();
  const chainId = useChainIdFromLocalStorage();

  // Get smart account address from session context
  const { smartAccountAddress, isCalculatingAddress } = useSession();

  // Get EOA balance (connected wallet)
  const {
    balance: eoaBalance,
    nativeBalance: eoaNativeBalance,
    wrappedBalance: eoaWrappedBalance,
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
    refetch: refetchSmartAccountBalance,
  } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId,
    enabled: Boolean(smartAccountAddress),
  });

  const [nextDistribution, setNextDistribution] = useState(
    getNextDistributionCountdown()
  );
  const [isGetUsdeOpen, setIsGetUsdeOpen] = useState(false);
  const [isTransferLoading, setIsTransferLoading] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const { toast } = useToast();

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

  // Set max amount when dialog opens
  useEffect(() => {
    if (isGetUsdeOpen && maxTransferable > 0) {
      setTransferAmount(formatDollarLikeBalance(maxTransferable));
    }
  }, [isGetUsdeOpen, maxTransferable]);

  // Handle transfer from wallet using the wallet provider directly
  const handleTransferFromWallet = async () => {
    console.log('[Transfer] handleTransferFromWallet called', {
      smartAccountAddress,
      eoaAddress,
      transferAmountNum,
      fromWrapped,
      fromNative,
      connector: !!connector,
    });

    if (!smartAccountAddress || !eoaAddress || !isValidTransfer) {
      toast({
        title: 'Cannot transfer',
        description: !smartAccountAddress
          ? 'Smart account address not available'
          : !isValidTransfer
            ? 'Invalid transfer amount'
            : 'Wallet not connected',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    if (!connector) {
      toast({
        title: 'Cannot transfer',
        description: 'No wallet connected',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setIsTransferLoading(true);
    setTransferStatus('');

    try {
      // Get the wallet provider from the connector
      const provider = (await connector.getProvider()) as {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };

      // Add Ethereal chain to wallet and switch to it
      console.log(
        '[Transfer] Adding/switching to Ethereal chain:',
        CHAIN_ID_ETHEREAL
      );
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: toHex(CHAIN_ID_ETHEREAL),
              chainName: ethereal.name,
              nativeCurrency: ethereal.nativeCurrency,
              rpcUrls: [ethereal.rpcUrls.default.http[0]],
            },
          ],
        });
      } catch (addError: unknown) {
        // Ignore "already exists" errors
        console.log(
          '[Transfer] Add chain result:',
          (addError as Error)?.message || 'success'
        );
      }

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: toHex(CHAIN_ID_ETHEREAL) }],
        });
        console.log('[Transfer] Chain switch successful');
      } catch (switchError: unknown) {
        console.error('[Transfer] Switch chain error:', switchError);
        throw new Error(
          `Failed to switch to Ethereal chain: ${(switchError as Error)?.message || 'Unknown error'}`
        );
      }

      // Step 1: Wrap native USDe if needed
      if (fromNative > 0) {
        setTransferStatus('Wrapping native USDe...');
        const wrapAmount = parseEther(fromNative.toString());

        console.log('[Transfer] Wrapping native USDe:', {
          amount: fromNative,
          wrapAmount: wrapAmount.toString(),
        });

        const wrapData = encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        });

        const wrapTxHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: eoaAddress,
              to: WUSDE_ADDRESS,
              data: wrapData,
              value: toHex(wrapAmount),
            },
          ],
        });
        console.log('[Transfer] Wrap transaction hash:', wrapTxHash);

        // Wait for wrap transaction to be mined
        setTransferStatus('Waiting for wrap confirmation...');
        const publicClient = getPublicClientForChainId(CHAIN_ID_ETHEREAL);
        await publicClient.waitForTransactionReceipt({
          hash: wrapTxHash as `0x${string}`,
          timeout: 60_000, // 60 second timeout
        });
      }

      // Step 2: Transfer wUSDe to Predict account
      setTransferStatus('Transferring wUSDe...');
      const totalWusdeToTransfer = parseEther(transferAmountNum.toString());

      console.log('[Transfer] Transferring wUSDe:', {
        amount: transferAmountNum,
        totalWusdeToTransfer: totalWusdeToTransfer.toString(),
        to: smartAccountAddress,
      });

      const transferData = encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'transfer',
        args: [smartAccountAddress, totalWusdeToTransfer],
      });

      const transferTxHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: eoaAddress,
            to: WUSDE_ADDRESS,
            data: transferData,
          },
        ],
      });
      console.log('[Transfer] Transfer transaction hash:', transferTxHash);

      setTransferStatus('');
      toast({
        title: 'Transfer successful',
        description: `${formatDollarLikeBalance(transferAmountNum)} wUSDe transferred to your Predict account.`,
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

  useEffect(() => {
    const interval = setInterval(() => {
      setNextDistribution(getNextDistributionCountdown());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
      <HoverCard openDelay={100} closeDelay={200}>
        <HoverCardTrigger>
          <div
            className={`inline-flex items-center rounded-md h-9 px-3 min-w-[122px] justify-start gap-2 bg-brand-black text-brand-white border border-ethena/40 hover:bg-brand-black/90 font-mono shadow-[0_0_12px_rgba(136,180,245,0.3)] hover:shadow-[0_0_18px_rgba(136,180,245,0.5)] transition-shadow cursor-default text-sm ${buttonClassName ?? ''}`}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/usde.svg"
                alt="USDe"
                width={20}
                height={20}
                className="opacity-90 ml-[-2px] w-5 h-5"
              />
              <span className="relative top-[1px] md:top-0 text-sm font-normal">
                {smartAccountBalance.toFixed(2)} {symbol}
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
        </HoverCardTrigger>
        <HoverCardContent side="bottom" className="w-auto p-4">
          <div className="flex items-center gap-4">
            {/* Left section - Get USDe */}
            <div className="flex flex-col items-center justify-center min-w-[120px] space-y-3">
              <div className="space-y-2 text-center">
                <p className="font-medium text-sm">
                  Sapience
                  <br />
                  Account Balance
                </p>
                <p className="text-lg font-mono">
                  {smartAccountBalance.toFixed(2)} {symbol}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2"
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
            </div>

            {/* Vertical separator */}
            <div className="h-20 w-px bg-border" />

            {/* Right section - Distribution info */}
            <div className="space-y-3 text-center min-w-[160px]">
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  Automatic Reward
                  <br />
                  Distributions Weekly
                </p>
                <p className="text-muted-foreground text-xs font-mono uppercase">
                  Next distribution in
                  <br />
                  {nextDistribution}
                </p>
              </div>
              <Button size="sm" variant="outline" className="w-full">
                Claim Rewards
              </Button>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Get USDe Dialog */}
      <Dialog open={isGetUsdeOpen} onOpenChange={setIsGetUsdeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Get USDe</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Transfer{' '}
              <a
                href={STARGATE_DEPOSIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="gold-link"
              >
                USDe on Ethereal
              </a>{' '}
              to your Sapience account to get started.
            </p>

            {/* Two Account Cards */}
            <div className="flex items-stretch gap-3">
              {/* Ethereum Account Card */}
              <div className="flex-1 rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Ethereum Account
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
                            {eoaNativeBalance.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Wrapped USDe
                          </span>
                          <span className="font-mono">
                            {eoaWrappedBalance.toFixed(2)}
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
                            {smartAccountNativeBalance.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Wrapped USDe
                          </span>
                          <span className="font-mono">
                            {smartAccountWrappedBalance.toFixed(2)}
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
                  disabled={isTransferLoading}
                />
                {transferAmountNum > 0 &&
                  (fromWrapped > 0 || fromNative > 0) && (
                    <HoverCard openDelay={100} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
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
                                {fromWrapped.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {fromNative > 0 && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">
                                Native USDe (to wrap)
                              </span>
                              <span className="font-mono">
                                {fromNative.toFixed(2)}
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
                  isTransferLoading || !smartAccountAddress || !isValidTransfer
                }
              >
                {isTransferLoading
                  ? transferStatus || 'Processing...'
                  : 'Transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
