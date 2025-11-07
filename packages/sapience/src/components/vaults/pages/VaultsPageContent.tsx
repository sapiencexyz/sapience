'use client';

import { passiveLiquidityVault } from '@sapience/sdk/contracts';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Card, CardContent } from '@sapience/sdk/ui/components/ui/card';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { Vault } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

const VaultsPageContent = () => {
  const { isConnected } = useAccount();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  // Constants for vault integration - use chain ID from localStorage
  const VAULT_CHAIN_ID = useChainIdFromLocalStorage();
  const VAULT_ADDRESS = passiveLiquidityVault[VAULT_CHAIN_ID]?.address;

  // Vaults are always enabled

  // Vault integration
  const {
    vaultData,
    userData,
    depositRequest: _depositRequest,
    withdrawalRequest: _withdrawalRequest,
    pendingRequest,
    userAssetBalance,
    assetDecimals,
    isLoadingUserData: _isLoadingUserData,
    isVaultPending,
    deposit,
    requestWithdrawal,
    cancelDeposit,
    cancelWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    minDeposit,
    allowance,
    pricePerShare,
    vaultManager: _vaultManager,
    quoteSignatureValid,
    expirationTime,
    interactionDelay,
    interactionDelayRemainingSec: _interactionDelayRemainingSec,
    isInteractionDelayActive,
    lastInteractionAt,
  } = usePassiveLiquidityVault({
    vaultAddress: VAULT_ADDRESS,
    chainId: VAULT_CHAIN_ID,
  });

  // Form state
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'deposit' | 'withdraw' | 'cancelDeposit' | 'cancelWithdrawal' | undefined
  >(undefined);
  // No slippage; we rely on manager-provided decimal pricePerShare quote

  // Derived validation
  const depositWei =
    depositAmount && assetDecimals !== undefined
      ? (() => {
          try {
            return parseUnits(depositAmount, assetDecimals);
          } catch {
            return 0n;
          }
        })()
      : 0n;
  const belowMinDeposit =
    (minDeposit ?? 0n) > 0n &&
    (depositWei === 0n || depositWei < (minDeposit ?? 0n));
  const requiresApproval = depositWei > 0n && (allowance ?? 0n) < depositWei;

  // UI helpers
  const shortWalletBalance = (() => {
    try {
      const num = Number(
        userAssetBalance ? formatAssetAmount(userAssetBalance) : '0'
      );
      if (Number.isFinite(num)) return num.toFixed(2);
      return '0.00';
    } catch {
      return '0.00';
    }
  })();

  const _pendingWithdrawalDisplay = (() => {
    const pending = userData?.pendingWithdrawal ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const _pendingDepositDisplay = (() => {
    const pending = userData?.pendingDeposit ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const depositQueuePosition = (() => {
    const index = userData?.depositIndex ?? 0n;
    if (index <= 0n) return null;
    try {
      const num = Number(index);
      if (!Number.isFinite(num)) return null;
      return num;
    } catch {
      return null;
    }
  })();

  // Removed withdrawal delay header display; keep minimal derived UI state only

  // Prefill deposit with minimum amount once when available
  const didPrefillMinRef = useRef(false);
  useEffect(() => {
    if (didPrefillMinRef.current) return;
    if (!assetDecimals) return;
    const min = minDeposit ?? 0n;
    if (min <= 0n) return;
    try {
      const currentWei = depositAmount
        ? (() => {
            try {
              return parseUnits(depositAmount, assetDecimals);
            } catch {
              return 0n;
            }
          })()
        : 0n;
      if (!depositAmount || currentWei < min) {
        setDepositAmount(formatAssetAmount(min));
        didPrefillMinRef.current = true;
      }
    } catch {
      /* noop */
    }
  }, [assetDecimals, minDeposit, depositAmount, formatAssetAmount]);

  useEffect(() => {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultPage] inputs', {
          VAULT_CHAIN_ID,
          VAULT_ADDRESS,
        });
      }
    } catch {
      /* noop */
    }
  }, []);

  // Quotes: estimated shares/assets and minimum thresholds with slippage
  const estDepositShares = useMemo(() => {
    if (!depositAmount || !assetDecimals) return 0n;
    try {
      const amountWei = parseUnits(depositAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return ppsScaled === 0n
        ? 0n
        : (amountWei * 10n ** BigInt(assetDecimals)) / ppsScaled;
    } catch {
      return 0n;
    }
  }, [depositAmount, assetDecimals, pricePerShare]);

  const estWithdrawAssets = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      const sharesWei = parseUnits(withdrawAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return (sharesWei * ppsScaled) / 10n ** BigInt(assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals, pricePerShare]);

  const withdrawSharesWei = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      return parseUnits(withdrawAmount, assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals]);

  const withdrawExceedsShareBalance = useMemo(() => {
    const balanceShares = userData?.balance ?? 0n;
    try {
      return withdrawSharesWei > balanceShares;
    } catch {
      return false;
    }
  }, [withdrawSharesWei, userData]);

  // Live cooldown countdown (HH:MM:SS)
  const [cooldownDisplay, setCooldownDisplay] = useState<string>('');
  useEffect(() => {
    if (!isInteractionDelayActive) {
      setCooldownDisplay('');
      return;
    }

    const compute = () => {
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const target = Number(lastInteractionAt + interactionDelay);
        const remaining = Math.max(0, target - nowSec);
        const totalHours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        const hourLabel = totalHours === 1 ? 'hour' : 'hours';
        const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
        const secondLabel = seconds === 1 ? 'second' : 'seconds';
        setCooldownDisplay(
          `${totalHours} ${hourLabel}, ${minutes} ${minuteLabel}, and ${seconds} ${secondLabel}`
        );
      } catch {
        setCooldownDisplay('');
      }
    };

    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [isInteractionDelayActive, lastInteractionAt, interactionDelay]);

  // Desktop-only top gradient bar across categories in filter order (match BetSlip)
  const categoryGradient = useMemo(() => {
    const colors = FOCUS_AREAS.map((fa) => fa.color);
    if (colors.length === 0) return 'transparent';
    if (colors.length === 1) return colors[0];
    const step = 100 / (colors.length - 1);
    const stops = colors.map((c, i) => `${c} ${i * step}%`);
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, []);

  const renderVaultForm = () => (
    <Tabs defaultValue="deposit" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-3">
        <TabsTrigger
          value="deposit"
          className="data-[state=active]:text-brand-white"
        >
          Deposit
        </TabsTrigger>
        <TabsTrigger
          value="withdraw"
          className="data-[state=active]:text-brand-white"
        >
          Withdraw
        </TabsTrigger>
      </TabsList>

      <TabsContent value="deposit" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">testUSDe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance: <NumberDisplay value={Number(shortWalletBalance)} />{' '}
              testUSDe
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDepositAmount(shortWalletBalance)}
            >
              MAX
            </Button>
          </div>
          {depositAmount &&
          estDepositShares > 0n &&
          ((minDeposit ?? 0n) === 0n || depositWei >= (minDeposit ?? 0n)) ? (
            <div className="sm:text-right">
              Requested Shares:{' '}
              {formatDecimalWithCommasFixed2(
                formatSharesAmount(estDepositShares)
              )}{' '}
              sapLP
            </div>
          ) : (
            (minDeposit ?? 0n) > 0n && (
              <div className="sm:text-right">
                Minimum Deposit: {formatAssetAmount(minDeposit ?? 0n)} testUSDe
              </div>
            )
          )}
        </div>

        {/* Cooldown + Deposit Button Group */}
        <div className="space-y-2 pt-3 md:pt-4">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300 mb-2">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          {/* Deposit Button */}
          <Button
            size="lg"
            className="w-full text-base bg-brand-white text-brand-black hover:bg-brand-white/90"
            disabled={
              !depositAmount ||
              isVaultPending ||
              !!vaultData?.paused ||
              belowMinDeposit ||
              !pricePerShare ||
              pricePerShare === '0' ||
              isInteractionDelayActive ||
              !!(pendingRequest && !pendingRequest.processed)
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  await Promise.resolve(connectOrCreateWallet?.());
                } catch {
                  // ignore wallet connect errors
                }
                return;
              }
              setPendingAction('deposit');
              await deposit(depositAmount, VAULT_CHAIN_ID);
              setDepositAmount('');
              setPendingAction(undefined);
            }}
          >
            {pendingRequest && !pendingRequest.processed
              ? 'Request Pending'
              : isVaultPending && pendingAction === 'deposit'
                ? 'Processing...'
                : vaultData?.paused
                  ? 'Vault Paused'
                  : isInteractionDelayActive
                    ? 'Cooldown in progress'
                    : quoteSignatureValid === false
                      ? 'Waiting for Price Quote'
                      : !pricePerShare || pricePerShare === '0'
                        ? 'No Price Available'
                        : requiresApproval
                          ? 'Approve & Deposit'
                          : 'Submit Deposit'}
          </Button>
        </div>

        {/* Consolidated pending section rendered below tabs */}
      </TabsContent>

      <TabsContent value="withdraw" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">sapLP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance:{' '}
              {userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'}{' '}
              sapLP
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() =>
                setWithdrawAmount(
                  userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'
                )
              }
            >
              MAX
            </Button>
          </div>
          {withdrawAmount &&
            estWithdrawAssets > 0n &&
            !withdrawExceedsShareBalance && (
              <div className="sm:text-right">
                Requested Collateral: {formatAssetAmount(estWithdrawAssets)}{' '}
                testUSDe
              </div>
            )}
        </div>

        {/* Cooldown + Withdraw Button Group */}
        <div className="space-y-2 pt-3 md:pt-4">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300 mb-2">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          {/* Withdraw Button */}
          <Button
            size="lg"
            className="w-full text-base bg-brand-white text-brand-black hover:bg-brand-white/90"
            disabled={
              !withdrawAmount ||
              isVaultPending ||
              !!vaultData?.paused ||
              !pricePerShare ||
              pricePerShare === '0' ||
              isInteractionDelayActive ||
              !!(pendingRequest && !pendingRequest.processed) ||
              withdrawExceedsShareBalance
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  await Promise.resolve(connectOrCreateWallet?.());
                } catch {
                  // ignore wallet connect errors
                }
                return;
              }
              setPendingAction('withdraw');
              await requestWithdrawal(withdrawAmount, VAULT_CHAIN_ID);
              setPendingAction(undefined);
            }}
          >
            {pendingRequest && !pendingRequest.processed
              ? 'Request Pending'
              : isVaultPending && pendingAction === 'withdraw'
                ? 'Processing...'
                : vaultData?.paused
                  ? 'Vault Paused'
                  : withdrawExceedsShareBalance
                    ? 'Insufficient Balance'
                    : isInteractionDelayActive
                      ? 'Cooldown in progress'
                      : !pricePerShare || pricePerShare === '0'
                        ? 'No Price Available'
                        : 'Request Withdrawal'}
          </Button>
        </div>

        {/* Consolidated pending section rendered below tabs */}
      </TabsContent>
    </Tabs>
  );

  const formatIntWithCommas = (intStr: string): string => {
    try {
      const neg = intStr.startsWith('-');
      const digits =
        (neg ? intStr.slice(1) : intStr).replace(/\D+/g, '') || '0';
      const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-' : '') + withCommas;
    } catch {
      return '0';
    }
  };

  const formatDecimalWithCommasFixed2 = (value: string): string => {
    try {
      const trimmed = value.trim();
      if (!trimmed) return '0.00';
      const neg = trimmed.startsWith('-');
      const t = neg ? trimmed.slice(1) : trimmed;
      const [intRaw, fracRaw = ''] = t.split('.');
      const intPart = intRaw.replace(/\D+/g, '') || '0';
      const frac = fracRaw.replace(/\D+/g, '') + '000';
      const d1 = frac.charCodeAt(0) - 48;
      const d2 = frac.charCodeAt(1) - 48;
      const d3 = frac.charCodeAt(2) - 48;
      let two = d1 * 10 + d2;
      let carry = 0;
      if (d3 >= 5) {
        two += 1;
        if (two >= 100) {
          two -= 100;
          carry = 1;
        }
      }
      const twoStr = two.toString().padStart(2, '0');

      let intOut = intPart;
      if (carry) {
        let c = 1;
        let res = '';
        for (let i = intPart.length - 1; i >= 0; i--) {
          const code = intPart.charCodeAt(i);
          const isDigit = code >= 48 && code <= 57;
          const digit = (isDigit ? code - 48 : 0) + c;
          if (digit >= 10) {
            res = String(digit - 10) + res;
            c = 1;
          } else {
            res = String(digit) + res;
            c = 0;
          }
        }
        if (c) res = '1' + res;
        intOut = res;
      }

      const intWithCommas = formatIntWithCommas(intOut);
      return (neg ? '-' : '') + intWithCommas + '.' + twoStr;
    } catch {
      return '0.00';
    }
  };

  // Derived vault metrics for display
  const tvlWei = useMemo(() => {
    try {
      const totalAssetsWei = vaultData?.totalAssets ?? 0n;
      if (totalAssetsWei > 0n) return totalAssetsWei;

      // Fallback: derive TVL from totalSupply * pricePerShare when assets aren't populated
      if (
        vaultData?.totalSupply &&
        pricePerShare &&
        pricePerShare !== '0' &&
        assetDecimals !== undefined
      ) {
        try {
          const ppsScaled = parseUnits(pricePerShare, assetDecimals);
          return (
            (vaultData.totalSupply * ppsScaled) / 10n ** BigInt(assetDecimals)
          );
        } catch {
          // ignore fallback errors and return 0n below
        }
      }

      return 0n;
    } catch {
      return 0n;
    }
  }, [vaultData, pricePerShare, assetDecimals]);

  const deployedWei = useMemo(() => {
    try {
      return vaultData?.totalDeployed ?? 0n;
    } catch {
      return 0n;
    }
  }, [vaultData]);

  const utilizationPercent = useMemo(() => {
    try {
      // Primary: on-chain utilization rate in basis points
      if (vaultData?.utilizationRate !== undefined) {
        const pct = Number(vaultData.utilizationRate) / 100; // bps -> percent
        if (!Number.isFinite(pct)) return 0;
        return Math.max(0, Math.min(100, pct));
      }
      // Fallback: compute from deployed/total
      if (tvlWei > 0n) {
        const bps = Number((deployedWei * 10000n) / tvlWei);
        const pct = bps / 100;
        if (!Number.isFinite(pct)) return 0;
        return Math.max(0, Math.min(100, pct));
      }
      return 0;
    } catch {
      return 0;
    }
  }, [vaultData, tvlWei, deployedWei]);

  // Preformatted display strings
  const tvlDisplay = useMemo(() => {
    try {
      return formatDecimalWithCommasFixed2(formatAssetAmount(tvlWei));
    } catch {
      return '0';
    }
  }, [tvlWei, formatAssetAmount]);

  const deployedDisplay = useMemo(() => {
    try {
      return formatDecimalWithCommasFixed2(formatAssetAmount(deployedWei));
    } catch {
      return '0';
    }
  }, [deployedWei, formatAssetAmount]);

  const utilizationDisplay = useMemo(() => {
    try {
      return `${Math.round(utilizationPercent)}%`;
    } catch {
      return '0%';
    }
  }, [utilizationPercent]);

  return (
    <div className="relative">
      {/* Main Content */}
      <div className="container max-w-[600px] mx-auto px-4 pt-32 pb-12 relative z-10">
        <div className="mb-5 md:mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl md:text-5xl font-sans font-normal text-foreground">
            Vaults
          </h1>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="inline-flex items-center gap-2"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Vault className="h-4 w-4" />
                    Deploy Vault
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming soon</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Vault */}
          <div>
            <Card className="relative bg-brand-black border border-brand-white/10 rounded-none shadow-sm">
              <div
                className="hidden lg:block absolute top-0 left-0 right-0 h-px"
                style={{ background: categoryGradient }}
              />
              <CardContent className="p-6">
                <div className="space-y-6">
                  {/* Vault Header */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-2xl font-medium mb-1">
                        Protocol Vault
                      </h3>
                      <div className="flex items-center gap-2">
                        <EnsAvatar
                          address={VAULT_ADDRESS}
                          width={16}
                          height={16}
                          className="shrink-0"
                        />
                        <AddressDisplay
                          address={VAULT_ADDRESS}
                          compact
                          className="text-xs text-muted-foreground"
                          hideVaultIcon
                        />
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-sm text-muted-foreground">
                        Total Value Locked
                      </div>
                      <div className="text-xl font-normal font-mono">
                        {tvlDisplay} testUSDe
                      </div>
                    </div>
                  </div>

                  {/* Vault Stats */}
                  <div className="space-y-4">
                    {/* Utilization Block */}
                    <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)]">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 text-foreground">
                        <div className="text-sm font-normal">
                          Utilization Rate: {utilizationDisplay}
                        </div>
                        <div className="text-sm font-normal">
                          Deployed: {deployedDisplay} testUSDe
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-sm bg-[hsl(var(--primary)/_0.09)] overflow-hidden shadow-inner">
                        <div
                          className="h-2 bg-accent-gold rounded-sm transition-all gold-sheen"
                          style={{ width: `${utilizationPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs">
                        <Link
                          href={`/profile/${VAULT_ADDRESS}`}
                          className="gold-link"
                        >
                          View Portfolio
                        </Link>
                      </p>
                    </div>
                    {/* APY Row intentionally omitted until calculation available */}
                  </div>

                  {/* Deposit/Withdraw Tabs */}
                  {renderVaultForm()}

                  {/* Pending Requests (mapping-based) */}
                  {pendingRequest && !pendingRequest.processed && (
                    <div className="mt-4 space-y-2">
                      <div className="p-3 bg-muted/30 border border-brand-white/10 rounded-md">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="text-sm text-muted-foreground">
                            <p className="font-medium">
                              {pendingRequest.isDeposit
                                ? 'Pending Deposit'
                                : 'Pending Withdrawal'}
                            </p>
                            <p className="text-xs">
                              {pendingRequest.isDeposit ? (
                                <>
                                  {formatAssetAmount(pendingRequest.assets)}{' '}
                                  testUSDe
                                  {depositQueuePosition
                                    ? ` · Queue #${depositQueuePosition}`
                                    : ''}
                                </>
                              ) : (
                                <>
                                  {formatSharesAmount(pendingRequest.shares)}{' '}
                                  sapLP
                                </>
                              )}
                            </p>
                          </div>
                          {pendingRequest.isDeposit ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                Date.now() >=
                                (Number(pendingRequest.timestamp) +
                                  Number(expirationTime ?? 0n)) *
                                  1000
                              }
                              onClick={async () => {
                                setPendingAction('cancelDeposit');
                                await cancelDeposit(VAULT_CHAIN_ID);
                                setPendingAction(undefined);
                              }}
                            >
                              {isVaultPending &&
                              pendingAction === 'cancelDeposit'
                                ? 'Processing...'
                                : 'Cancel'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                Date.now() >=
                                (Number(pendingRequest.timestamp) +
                                  Number(expirationTime ?? 0n)) *
                                  1000
                              }
                              onClick={async () => {
                                setPendingAction('cancelWithdrawal');
                                await cancelWithdrawal(VAULT_CHAIN_ID);
                                setPendingAction(undefined);
                              }}
                            >
                              {isVaultPending &&
                              pendingAction === 'cancelWithdrawal'
                                ? 'Processing...'
                                : 'Cancel'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultsPageContent;
