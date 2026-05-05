'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi';
import {
  encodeFunctionData,
  formatUnits,
  parseEther,
  type EIP1193Provider,
} from 'viem';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { STARGATE_FROM_ETHEREAL_URL } from '~/lib/bridge/links';
import { WUSDE_ABI } from '~/lib/contracts/wusdeAbi';
import { useSession } from '~/lib/context/SessionContext';
import { formatDollarLikeBalance } from '~/lib/format/balance';
import {
  executeSudoTransaction,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';
import { planWithdrawCalls } from '~/lib/withdraw/planWithdrawCalls';

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Withdraws native USDe from the smart account to the EOA on Ethereal as a
 * single paymaster-sponsored UserOp (atomic unwrap-as-needed + native send).
 * Then guides the user to bridge out via Stargate from the EOA.
 *
 * Withdrawals deliberately use the sudo (owner-signed) path because the
 * session key's CallPolicy explicitly forbids `wUSDe.withdraw`, transfers,
 * and bare native value sends — so the wallet popup is by design.
 */
export default function WithdrawDialog({
  open,
  onOpenChange,
}: WithdrawDialogProps) {
  const { address: eoaAddress, connector } = useAccount();
  const { smartAccountAddress, isCalculatingAddress } = useSession();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { toast } = useToast();

  const wusdeAddress = collateralToken[DEFAULT_CHAIN_ID]?.address;

  const {
    balance: eoaBalance,
    nativeBalance: eoaNativeBalance,
    wrappedBalance: eoaWrappedBalance,
    rawWrappedBalance: rawEoaWrappedBalance,
    symbol,
    refetch: refetchEoaBalance,
  } = useCollateralBalance({
    address: eoaAddress,
    chainId: DEFAULT_CHAIN_ID,
  });

  const {
    balance: smartAccountBalance,
    nativeBalance: smartAccountNativeBalance,
    wrappedBalance: smartAccountWrappedBalance,
    rawNativeBalance: rawSmartAccountNativeBalance,
    rawWrappedBalance: rawSmartAccountWrappedBalance,
    refetch: refetchSmartAccountBalance,
  } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(smartAccountAddress),
  });

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [isAwaitingSignature, setIsAwaitingSignature] = useState(false);
  const [isUnwrapping, setIsUnwrapping] = useState(false);

  const rawTotalWithdrawable =
    rawSmartAccountNativeBalance + rawSmartAccountWrappedBalance;

  // Parse the input string straight to wei. No float round-trip — money code
  // shouldn't depend on parseFloat precision when raw balances are already
  // bigints. Returns null for empty / non-numeric / non-positive input.
  const rawWithdrawAmount = useMemo<bigint | null>(() => {
    if (!withdrawAmount) return null;
    try {
      const parsed = parseEther(withdrawAmount);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [withdrawAmount]);

  const isValidWithdraw =
    rawWithdrawAmount !== null && rawWithdrawAmount <= rawTotalWithdrawable;

  // Prefill the input with the user's max withdrawable when the dialog opens.
  // Truncates to 2 decimals via string ops so the prefilled value can never
  // exceed the actual balance (a float divide could).
  useEffect(() => {
    if (!open) return;
    if (rawTotalWithdrawable === 0n) return;
    const [whole, dec = ''] = formatUnits(rawTotalWithdrawable, 18).split('.');
    const truncated = dec.slice(0, 2);
    setWithdrawAmount(truncated ? `${whole}.${truncated}` : whole);
  }, [open, rawTotalWithdrawable]);

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

    if (rawWithdrawAmount === null) return;

    setIsWithdrawLoading(true);

    try {
      const { calls, amount: sentAmount } = planWithdrawCalls({
        rawAmount: rawWithdrawAmount,
        rawNative: rawSmartAccountNativeBalance,
        rawWrapped: rawSmartAccountWrappedBalance,
        recipient: eoaAddress,
        wusdeAddress,
      });

      const provider = (await connector.getProvider()) as EIP1193Provider;
      const ownerSigner: OwnerSigner = {
        address: eoaAddress,
        provider,
        switchChain: async (targetChainId: number) => {
          await switchChainAsync({ chainId: targetChainId });
        },
      };

      setIsAwaitingSignature(true);

      // Sudo path bypasses session keys (which forbid these calls by
      // CallPolicy). All calls bundle into one paymaster-sponsored UserOp.
      await executeSudoTransaction(ownerSigner, calls, DEFAULT_CHAIN_ID);

      toast({
        title: 'Withdraw Successful',
        description: `${formatDollarLikeBalance(formatUnits(sentAmount, 18))} ${symbol} sent to ${eoaAddress.slice(0, 6)}...${eoaAddress.slice(-4)}`,
        duration: 5000,
      });

      setTimeout(() => {
        refetchEoaBalance();
        refetchSmartAccountBalance();
      }, 3000);
    } catch (error: unknown) {
      console.error('Withdraw failed:', error);
      toast({
        title: 'Withdrawal failed',
        description: (error as Error)?.message || 'Failed to withdraw USDe',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsWithdrawLoading(false);
      setIsAwaitingSignature(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Withdraw to Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Two stacked step cards. Each pairs an account (Sapience for
              step 1, Ethereal Wallet for step 2) with the action that
              operates on it, so the account context reads as part of
              the step rather than as a separate "from → to" diagram. */}
          <div className="space-y-6">
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
                        <AddressDisplay address={smartAccountAddress} compact />
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
                          {formatDollarLikeBalance(smartAccountWrappedBalance)}
                        </span>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>
              <div className="flex items-center gap-2">
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
                    ? isAwaitingSignature
                      ? 'Confirm in wallet...'
                      : 'Processing...'
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
                      From Ethereal Wallet
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
              <div className="space-y-4">
                {/* If wUSDe is sitting on the EOA, surface a one-click
                    unwrap so users can hand Stargate native USDe. */}
                {eoaWrappedBalance > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                    <span className="text-amber-400">
                      {formatDollarLikeBalance(eoaWrappedBalance)} wUSDe in
                      wallet. Unwrap before bridging.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs shrink-0 border-amber-500/40 bg-transparent text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                      onClick={handleUnwrapEoa}
                      disabled={isUnwrapping}
                    >
                      {isUnwrapping ? 'Unwrapping…' : 'Unwrap'}
                    </Button>
                  </div>
                )}
                <Button className="h-11 w-full" asChild>
                  <a
                    href={STARGATE_FROM_ETHEREAL_URL}
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
  );
}
