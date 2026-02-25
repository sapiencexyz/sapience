'use client';

import { passiveLiquidityVault } from '@sapience/sdk/contracts';
import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Vault, Clock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import { formatDuration, intervalToDuration } from 'date-fns';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import Link from 'next/link';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { CHAIN_ID_ETHEREAL, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useProtocolStats } from '~/hooks/graphql/useAnalytics';
import RiskDisclaimer from '~/components/markets/forms/shared/RiskDisclaimer';
import Loader from '~/components/shared/Loader';
import VaultPnlChart from '~/components/vaults/VaultPnlChart';

const DEPOSIT_WHITELIST: `0x${string}`[] = [
  '0xdb5af497a73620d881561edb508012a5f84e9ba2',
  '0x7BB4e4E4674c625b23C550A74cfcfF9Ec50064F3',
];

const DEPOSIT_CAP = 10000;

const VaultsPageContent = () => {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { openConnectDialog } = useConnectDialog();
  // Constants for vault integration
  const VAULT_CHAIN_ID = CHAIN_ID_ETHEREAL;
  const VAULT_ADDRESS = passiveLiquidityVault[VAULT_CHAIN_ID]?.address;
  const collateralSymbol = COLLATERAL_SYMBOLS[VAULT_CHAIN_ID] || 'testUSDe';

  // Vaults are always enabled, but may be gated by jurisdiction

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

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();
  const { data: protocolStats, isLoading: isAnalyticsLoading } =
    useProtocolStats();

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

  // Desktop-only top gradient bar across categories in filter order (match CreatePositionForm)
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

      <TabsContent value="deposit" className="space-y-1 sm:space-y-2 mt-1">
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
                <span className="text-lg text-muted-foreground">
                  {collateralSymbol}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance:{' '}
              <NumberDisplay value={Number(shortWalletBalance)} decimals={2} />{' '}
              {collateralSymbol}
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
          <div
            className={`transition-opacity duration-300 ${
              depositAmount &&
              estDepositShares > 0n &&
              ((minDeposit ?? 0n) === 0n || depositWei >= (minDeposit ?? 0n))
                ? 'opacity-100'
                : 'opacity-0'
            }`}
          >
            Requested Shares:{' '}
            <NumberDisplay
              value={Number(formatSharesAmount(estDepositShares))}
              decimals={2}
            />{' '}
            sapLP
          </div>
        </div>

        {/* Cooldown + Deposit Button Group */}
        <div className="space-y-4 sm:pt-2 pb-3">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          <RestrictedJurisdictionBanner
            show={!isPermitLoading && isRestricted}
            iconClassName="h-4 w-4"
          />

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
              !!(pendingRequest && !pendingRequest.processed) ||
              isPermitLoading ||
              isRestricted ||
              (!!depositAmount && exceedsVaultCapacity) ||
              (isConnected && !isWhitelisted)
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  openConnectDialog();
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
                  : isConnected && !isWhitelisted
                    ? 'Request Early Access'
                    : isInteractionDelayActive
                      ? 'Cooldown in progress'
                      : !!depositAmount && exceedsVaultCapacity
                        ? 'Exceeds Vault Capacity'
                        : quoteSignatureValid === false
                          ? 'Waiting for Price Quote'
                          : !pricePerShare || pricePerShare === '0'
                            ? 'Cannot connect to vault'
                            : requiresApproval
                              ? 'Approve & Deposit'
                              : 'Submit Deposit'}
          </Button>
        </div>
        <div className="relative h-4">
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              depositAmount ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <RiskDisclaimer
              className="!text-xs"
              message="Do not risk more than you can afford to lose"
            />
          </div>
          {interactionDelay > 0n && (
            <div
              className={`absolute inset-0 text-xs text-muted-foreground text-center transition-opacity duration-300 ${
                depositAmount ? 'opacity-100' : 'opacity-0'
              }`}
            >
              Minimum Deposit Duration:{' '}
              {formatDuration(
                intervalToDuration({
                  start: 0,
                  end: Number(interactionDelay) * 1000,
                }),
                { format: ['days', 'hours', 'minutes'] }
              )}
            </div>
          )}
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
              <NumberDisplay
                value={Number(
                  userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'
                )}
                decimals={2}
              />{' '}
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
                Requested Collateral:{' '}
                <NumberDisplay
                  value={Number(formatAssetAmount(estWithdrawAssets))}
                  decimals={2}
                />{' '}
                {collateralSymbol}
              </div>
            )}
        </div>

        {/* Cooldown + Withdraw Button Group */}
        <div className="space-y-4 pt-2">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          <RestrictedJurisdictionBanner
            show={!isPermitLoading && isRestricted}
            iconClassName="h-4 w-4"
          />

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
              withdrawExceedsShareBalance ||
              isPermitLoading ||
              isRestricted
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  openConnectDialog();
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
                        ? 'Cannot connect to vault'
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
  // TVL = availableAssets + totalDeployed (direct on-chain reads)
  const tvlWei = useMemo(() => {
    try {
      const available = vaultData?.availableAssets ?? 0n;
      const deployed = vaultData?.totalDeployed ?? 0n;
      return available + deployed;
    } catch {
      return 0n;
    }
  }, [vaultData]);

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
        const pct = Number(vaultData.utilizationRate) / 1e16;
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

  const VAULT_CAPACITY_WEI = useMemo(() => {
    try {
      return parseUnits(DEPOSIT_CAP.toString(), assetDecimals ?? 18);
    } catch {
      return parseUnits(DEPOSIT_CAP.toString(), 18);
    }
  }, [assetDecimals]);

  const exceedsVaultCapacity = useMemo(() => {
    try {
      const newTotal = tvlWei + depositWei;
      return newTotal > VAULT_CAPACITY_WEI;
    } catch {
      return false;
    }
  }, [tvlWei, depositWei, VAULT_CAPACITY_WEI]);

  // Where the deposit cap falls on the utilization bar (bar represents 0→TVL)
  const capPercentOfTvl = useMemo(() => {
    try {
      if (tvlWei <= 0n) return 100;
      const pct = Number((VAULT_CAPACITY_WEI * 10000n) / tvlWei) / 100;
      return Math.max(0, Math.min(100, pct));
    } catch {
      return 100;
    }
  }, [tvlWei, VAULT_CAPACITY_WEI]);

  const depositCapDisplay = formatIntWithCommas(DEPOSIT_CAP.toString());

  // How full the vault is relative to the deposit cap (bar fill)
  const tvlPercentOfCap = useMemo(() => {
    try {
      if (VAULT_CAPACITY_WEI <= 0n) return 0;
      const pct = Number((tvlWei * 10000n) / VAULT_CAPACITY_WEI) / 100;
      return Math.max(0, Math.min(100, pct));
    } catch {
      return 0;
    }
  }, [tvlWei, VAULT_CAPACITY_WEI]);

  // Deployed portion as percentage of the deposit cap (for bar segment)
  const deployedPercentOfCap = useMemo(() => {
    try {
      if (VAULT_CAPACITY_WEI <= 0n) return 0;
      const pct = Number((deployedWei * 10000n) / VAULT_CAPACITY_WEI) / 100;
      return Math.max(0, Math.min(100, pct));
    } catch {
      return 0;
    }
  }, [deployedWei, VAULT_CAPACITY_WEI]);

  const isWhitelisted =
    DEPOSIT_WHITELIST.length === 0 ||
    (currentAddress &&
      DEPOSIT_WHITELIST.includes(
        currentAddress.toLowerCase() as `0x${string}`
      ));

  const utilizationDisplay = useMemo(() => {
    try {
      return `${utilizationPercent.toFixed(2)}%`;
    } catch {
      return '0.00%';
    }
  }, [utilizationPercent]);

  const yieldMetrics = useMemo(() => {
    const lastStat = protocolStats?.[protocolStats.length - 1];

    // Protocol TVL = vault balance + escrow balance (total wUSDe earning Ethena rewards)
    const protocolTvlWei = lastStat
      ? BigInt(lastStat.vaultBalance || '0') +
        BigInt(lastStat.escrowBalance || '0')
      : 0n;
    const protocolTvlNum = Number(formatAssetAmount(protocolTvlWei));

    // Vault TVL from live on-chain data (availableAssets + totalDeployed)
    const vaultTvlNum = Number(formatAssetAmount(tvlWei));

    // Ethena base APY (approximately 3.5%)
    const ETHENA_BASE_APY = 3.5;

    // Effective APY: Protocol earns 3.5% on its TVL, distributed to vault depositors
    // effectiveApy = (protocolTvl / vaultTvl) * baseApy
    const effectiveApy =
      vaultTvlNum > 0 ? (protocolTvlNum / vaultTvlNum) * ETHENA_BASE_APY : 0;

    // Weekly yield estimate based on effective APY
    const annualYieldToVault = vaultTvlNum * (effectiveApy / 100);
    const weeklyYield = (annualYieldToVault / 365) * 7;

    return {
      protocolTvl: formatDecimalWithCommasFixed2(protocolTvlNum.toString()),
      annualYield: formatDecimalWithCommasFixed2(annualYieldToVault.toString()),
      weeklyYield: formatDecimalWithCommasFixed2(weeklyYield.toString()),
      effectiveApy: effectiveApy.toFixed(2),
    };
  }, [tvlWei, formatAssetAmount, protocolStats]);

  return (
    <div className="relative">
      {/* Main Content */}
      <div className="container max-w-[600px] lg:max-w-[1200px] mx-auto px-4 pt-10 md:pt-14 lg:pt-10 pb-12 relative z-10">
        <div className="mb-4 md:mb-6 flex flex-row items-center justify-between">
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-2xl font-medium">Protocol Vault</h3>
                    <div className="flex items-center gap-2">
                      <EnsAvatar
                        address={VAULT_ADDRESS}
                        width={18}
                        height={18}
                        className="shrink-0"
                      />
                      <AddressDisplay
                        address={VAULT_ADDRESS}
                        className="text-sm text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Vault Stats - Two column layout on large screens */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Vault Balance, PnL Chart (appears second on mobile) */}
                    <div className="flex flex-col gap-6 order-2 lg:order-1 lg:min-h-0">
                      {/* Vault Balance Block */}
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10">
                        <h4 className="font-mono text-base uppercase tracking-wider text-brand-white mb-3 sm:mb-2">
                          Vault Balance
                          <br className="sm:hidden" />{' '}
                          <span className="font-medium text-[hsl(var(--ethena))]">
                            {tvlDisplay} {collateralSymbol}
                          </span>
                        </h4>
                        <div className="relative">
                          <div className="w-full h-3 rounded-sm bg-[hsl(var(--primary)/_0.09)] overflow-hidden shadow-inner relative">
                            <div
                              className="h-3 bg-accent-gold rounded-sm transition-all gold-sheen"
                              style={{
                                width: `${tvlWei > VAULT_CAPACITY_WEI ? 100 : tvlPercentOfCap}%`,
                              }}
                            />
                            {/* Utilization overlay — dashed border showing deployed portion */}
                            <div
                              className="absolute top-0 left-0 h-3 rounded-sm bg-brand-white transition-all"
                              style={{
                                width: `${tvlWei > VAULT_CAPACITY_WEI ? deployedPercentOfCap : Math.min(deployedPercentOfCap, tvlPercentOfCap)}%`,
                              }}
                            />
                          </div>
                          {/* Deposit cap line + rainbow excess when TVL exceeds cap */}
                          {tvlWei > VAULT_CAPACITY_WEI && (
                            <>
                              {/* Rainbow overlay for excess beyond cap */}
                              <div
                                className="absolute top-0 h-3 vault-excess-rainbow rounded-r-sm"
                                style={{
                                  left: `${capPercentOfTvl}%`,
                                  width: `${100 - capPercentOfTvl}%`,
                                }}
                              />
                              <div
                                className="absolute top-0 w-px h-3 border-l-2 border-background/70"
                                style={{ left: `${capPercentOfTvl}%` }}
                              />
                              <div
                                className="absolute -top-7 sm:-top-4 font-mono text-[10px] text-brand-white uppercase -translate-x-1/2 text-center sm:whitespace-nowrap"
                                style={{ left: `${capPercentOfTvl}%` }}
                              >
                                <span className="sm:hidden">
                                  deposit
                                  <br />
                                  cap
                                </span>
                                <span className="hidden sm:inline">
                                  deposit cap
                                </span>
                              </div>
                            </>
                          )}
                          {/* Deposit cap label at end of bar when TVL is under cap */}
                          {tvlWei <= VAULT_CAPACITY_WEI && (
                            <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground/50 uppercase">
                              {depositCapDisplay} cap
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-col items-start sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-0 text-sm">
                          <span className="font-mono text-muted-foreground uppercase">
                            {deployedDisplay} {collateralSymbol} (
                            {utilizationDisplay}) deployed
                          </span>
                          <Link
                            href={`/profile/${VAULT_ADDRESS}`}
                            className="text-sm gold-link"
                          >
                            View Profile
                          </Link>
                        </div>
                      </div>

                      {/* Vault PnL Chart */}
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10 lg:flex-1 lg:flex lg:flex-col lg:min-h-0 lg:overflow-hidden">
                        <VaultPnlChart
                          protocolStats={protocolStats ?? undefined}
                          isLoading={isAnalyticsLoading}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    {/* Right Column: Pending Requests, Manage Position & Vault Rewards (appears first on mobile) */}
                    <div className="flex flex-col gap-6 order-1 lg:order-2">
                      {/* Pending Requests */}
                      {pendingRequest &&
                        !pendingRequest.processed &&
                        (() => {
                          const expiresAt =
                            (Number(pendingRequest.timestamp) +
                              Number(expirationTime ?? 0n)) *
                            1000;
                          const isExpired = Date.now() >= expiresAt;
                          const actionType = pendingRequest.isDeposit
                            ? 'cancelDeposit'
                            : 'cancelWithdrawal';
                          const cancelFn = pendingRequest.isDeposit
                            ? cancelDeposit
                            : cancelWithdrawal;

                          return (
                            <div className="flex items-center gap-3 bg-muted/30 border border-brand-white/10 rounded-lg p-4">
                              <Clock
                                className={`h-6 w-6 shrink-0 ${isExpired ? 'text-muted-foreground/50' : 'text-muted-foreground animate-pulse'}`}
                              />
                              <div className="flex-1 flex items-center justify-between">
                                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                                  <span className="text-base font-medium text-brand-white">
                                    {isExpired
                                      ? pendingRequest.isDeposit
                                        ? 'Expired Deposit'
                                        : 'Expired Withdrawal'
                                      : pendingRequest.isDeposit
                                        ? 'Pending Deposit'
                                        : 'Pending Withdrawal'}
                                  </span>
                                  <span className="text-sm sm:text-base text-muted-foreground font-mono">
                                    {pendingRequest.isDeposit ? (
                                      <>
                                        {formatDecimalWithCommasFixed2(
                                          formatAssetAmount(
                                            pendingRequest.assets
                                          )
                                        )}{' '}
                                        {collateralSymbol}
                                        {depositQueuePosition
                                          ? ` · Queue #${depositQueuePosition}`
                                          : ''}
                                      </>
                                    ) : (
                                      <>
                                        {formatSharesAmount(
                                          pendingRequest.shares
                                        )}{' '}
                                        sapLP
                                      </>
                                    )}
                                  </span>
                                </div>
                                {isExpired ? (
                                  <Button
                                    size="sm"
                                    disabled={
                                      isVaultPending &&
                                      pendingAction === actionType
                                    }
                                    onClick={async () => {
                                      setPendingAction(actionType);
                                      await cancelFn(VAULT_CHAIN_ID);
                                      setPendingAction(undefined);
                                    }}
                                  >
                                    {isVaultPending &&
                                    pendingAction === actionType
                                      ? 'Processing...'
                                      : 'Reclaim'}
                                  </Button>
                                ) : (
                                  <span className="text-sm text-muted-foreground px-3 py-1.5">
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                      {/* Deposit/Withdraw Tabs */}
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10 lg:flex-1">
                        <h4 className="text-base font-mono uppercase tracking-wider text-brand-white mb-2">
                          Manage Position
                        </h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Swap {collateralSymbol} for sapLP, representing vault
                          shares. sapLP is an ERC-20 token that can be
                          transferred, traded, and used in other Ethereum DeFi
                          protocols.
                        </p>
                        {renderVaultForm()}
                      </div>

                      {/* Vault Rewards Info */}
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-ethena/40 shadow-[0_0_12px_rgba(136,180,245,0.3)]">
                        <div className="flex flex-col gap-4">
                          <div>
                            <div className="text-base font-mono uppercase tracking-wider text-accent-gold mb-2">
                              VAULT REWARDS
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Ethena rewards can be claimed by vault depositors.
                              This is separate from profit or loss realized by
                              the vault's participation in prediction markets.
                            </p>
                          </div>
                          {isAnalyticsLoading || !vaultData ? (
                            <div className="flex justify-center py-4">
                              <Loader className="w-6 h-6" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="sm:pr-4 sm:border-r border-brand-white/20">
                                <div className="text-3xl font-medium font-mono">
                                  {yieldMetrics.effectiveApy}%
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Approximate APY
                                </div>
                              </div>
                              <div className="sm:pl-4">
                                <div className="text-3xl font-medium font-mono">
                                  {yieldMetrics.weeklyYield} {collateralSymbol}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Approximate Weekly Distribution
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
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
