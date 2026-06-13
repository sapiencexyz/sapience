'use client';

import {
  predictionMarketVault,
  predictionMarketVaultStrategyB,
  singleLegVault,
} from '@sapience/sdk/contracts';
import { Button } from '@sapience/ui/components/ui/button';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import { Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { formatDuration, intervalToDuration } from 'date-fns';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useProtocolStats } from '~/hooks/graphql/useAnalytics';
import RiskDisclaimer from '~/components/markets/forms/shared/RiskDisclaimer';
import Loader from '~/components/shared/Loader';
import VaultPnlChart from '~/components/vaults/VaultPnlChart';
import { getVaultPnlAnchorSec } from '~/components/vaults/vaultAnchors';
import { ETHENA_BASE_APY } from '~/components/layout/StatusIndicators';

const DEPOSIT_WHITELIST: `0x${string}`[] = [
  '0xdb5af497a73620d881561edb508012a5f84e9ba2',
  '0x7BB4e4E4674c625b23C550A74cfcfF9Ec50064F3',
];

const DEPOSIT_CAP = 20000;

type VaultOption = {
  address: `0x${string}`;
  label: string;
};

const VAULT_QUERY_PARAM = 'address';

const normalizeAddress = (value: string | null | undefined) =>
  value ? value.toLowerCase() : '';

const VaultsPageContent = () => {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { openConnectDialog } = useConnectDialog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const VAULT_CHAIN_ID = DEFAULT_CHAIN_ID;

  const vaultOptions = useMemo<VaultOption[]>(() => {
    const entries: Array<[`0x${string}` | undefined, string]> = [
      [
        predictionMarketVault[VAULT_CHAIN_ID]?.address as
          | `0x${string}`
          | undefined,
        'Core Vault',
      ],
      [
        predictionMarketVaultStrategyB[VAULT_CHAIN_ID]?.address as
          | `0x${string}`
          | undefined,
        'Edge Vault',
      ],
      [
        singleLegVault[VAULT_CHAIN_ID]?.address as `0x${string}` | undefined,
        'Single Leg Vault',
      ],
    ];
    return entries
      .filter((entry): entry is [`0x${string}`, string] => Boolean(entry[0]))
      .map(([address, label]) => ({ address, label }));
  }, [VAULT_CHAIN_ID]);

  const queryVault = normalizeAddress(searchParams.get(VAULT_QUERY_PARAM));
  const hasVaultQueryParam = queryVault !== '';
  const selectedVault = useMemo(() => {
    const match = vaultOptions.find(
      (v) => normalizeAddress(v.address) === queryVault
    );
    return match ?? vaultOptions[0];
  }, [queryVault, vaultOptions]);

  useEffect(() => {
    if (!selectedVault || !hasVaultQueryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    if (
      normalizeAddress(params.get(VAULT_QUERY_PARAM)) ===
      normalizeAddress(selectedVault.address)
    ) {
      return;
    }
    params.set(VAULT_QUERY_PARAM, selectedVault.address.toLowerCase());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedVault, hasVaultQueryParam, searchParams, router, pathname]);

  const handleVaultChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(VAULT_QUERY_PARAM, value.toLowerCase());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const VAULT_ADDRESS = selectedVault?.address;
  const vaultTitle = selectedVault?.label ?? 'Vault';
  const selectedVaultValue = selectedVault?.address ?? '';
  const collateralSymbol = COLLATERAL_SYMBOLS[VAULT_CHAIN_ID] || 'testUSDe';

  // Separate reads for each of the (up to) three vaults so the Vault Rewards
  // calc can sum across all vaults regardless of which tab is selected. Hooks
  // must be called unconditionally, so missing addresses are handled inside
  // the hook via the `enabled` flag.
  const coreAddr = predictionMarketVault[VAULT_CHAIN_ID]?.address;
  const singleLegAddr = singleLegVault[VAULT_CHAIN_ID]?.address;
  const edgeAddr = predictionMarketVaultStrategyB[VAULT_CHAIN_ID]?.address;

  const coreVault = usePassiveLiquidityVault({
    vaultAddress: coreAddr,
    chainId: VAULT_CHAIN_ID,
  });
  const singleLegVaultData = usePassiveLiquidityVault({
    vaultAddress: singleLegAddr,
    chainId: VAULT_CHAIN_ID,
  });
  const edgeVault = usePassiveLiquidityVault({
    vaultAddress: edgeAddr,
    chainId: VAULT_CHAIN_ID,
  });

  const { data: coreStats } = useProtocolStats(coreAddr);
  const { data: singleLegStats } = useProtocolStats(singleLegAddr);
  const { data: edgeStats } = useProtocolStats(edgeAddr);

  const {
    vaultData,
    userData,
    pendingRequest,
    userAssetBalance,
    assetDecimals,
    isVaultPending,
    deposit,
    requestWithdrawal,
    cancelDeposit,
    cancelWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    allowance,
    pricePerShare,
    quoteSignatureValid,
    expirationTime,
    interactionDelay,
    isInteractionDelayActive,
    lastInteractionAt,
  } = usePassiveLiquidityVault({
    vaultAddress: VAULT_ADDRESS,
    chainId: VAULT_CHAIN_ID,
  });

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();
  const { data: protocolStats, isLoading: isAnalyticsLoading } =
    useProtocolStats(VAULT_ADDRESS);

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'deposit' | 'withdraw' | 'cancelDeposit' | 'cancelWithdrawal' | undefined
  >(undefined);

  const depositWei = (() => {
    if (!depositAmount) return 0n;
    try {
      return parseUnits(depositAmount, assetDecimals);
    } catch {
      return 0n;
    }
  })();
  const requiresApproval = depositWei > 0n && (allowance ?? 0n) < depositWei;

  const shortWalletBalance = (() => {
    const num = Number(
      userAssetBalance ? formatAssetAmount(userAssetBalance) : '0'
    );
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  })();

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

  const withdrawExceedsShareBalance = useMemo(
    () => withdrawSharesWei > (userData?.balance ?? 0n),
    [withdrawSharesWei, userData]
  );

  const [cooldownDisplay, setCooldownDisplay] = useState<string>('');
  useEffect(() => {
    if (!isInteractionDelayActive) {
      setCooldownDisplay('');
      return;
    }

    const compute = () => {
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
    };

    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [isInteractionDelayActive, lastInteractionAt, interactionDelay]);

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
              depositAmount && estDepositShares > 0n
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

          <Button
            size="lg"
            className="w-full text-base bg-brand-white text-brand-black hover:bg-brand-white/90"
            disabled={
              !depositAmount ||
              isVaultPending ||
              !!vaultData?.paused ||
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
                openConnectDialog();
                return;
              }
              setPendingAction('deposit');
              await deposit(depositAmount, VAULT_CHAIN_ID);
              setDepositAmount('');
              setPendingAction(undefined);
            }}
          >
            {(() => {
              if (pendingRequest && !pendingRequest.processed)
                return 'Request Pending';
              if (isVaultPending && pendingAction === 'deposit')
                return 'Processing...';
              if (vaultData?.paused) return 'Vault Paused';
              if (isConnected && !isWhitelisted) return 'Request Early Access';
              if (isInteractionDelayActive) return 'Cooldown in progress';
              if (depositAmount && exceedsVaultCapacity)
                return 'Exceeds Vault Capacity';
              if (quoteSignatureValid === false)
                return 'Waiting for Price Quote';
              if (!pricePerShare || pricePerShare === '0')
                return 'Cannot connect to vault';
              if (requiresApproval) return 'Approve & Deposit';
              return 'Submit Deposit';
            })()}
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
      </TabsContent>

      <TabsContent value="withdraw" className="space-y-2 mt-1">
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
                openConnectDialog();
                return;
              }
              setPendingAction('withdraw');
              await requestWithdrawal(withdrawAmount, VAULT_CHAIN_ID);
              setPendingAction(undefined);
            }}
          >
            {(() => {
              if (pendingRequest && !pendingRequest.processed)
                return 'Request Pending';
              if (isVaultPending && pendingAction === 'withdraw')
                return 'Processing...';
              if (vaultData?.paused) return 'Vault Paused';
              if (withdrawExceedsShareBalance) return 'Insufficient Balance';
              if (isInteractionDelayActive) return 'Cooldown in progress';
              if (!pricePerShare || pricePerShare === '0')
                return 'Cannot connect to vault';
              return 'Request Withdrawal';
            })()}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );

  const liquidWei = vaultData?.totalLiquidValue ?? 0n;

  const deployedWei = useMemo(() => {
    const lastStat = protocolStats?.[protocolStats.length - 1];
    return lastStat?.vaultDeployed ? BigInt(lastStat.vaultDeployed) : 0n;
  }, [protocolStats]);

  // Vault AUM = liquid USDe in the vault + collateral deployed in open positions.
  // getTotalLiquidValue() on the contract intentionally excludes position tokens,
  // so we add the deployed cost basis back here to show true total.
  const tvlWei = liquidWei + deployedWei;

  // The two terms come from different sources (on-chain read vs GraphQL);
  // until both have loaded, the sum is a misleading partial figure.
  const isBalanceReady = !!vaultData && !!protocolStats;

  const utilizationPercent = useMemo(() => {
    if (tvlWei <= 0n) return 0;
    const bps = Number((deployedWei * 10000n) / tvlWei);
    const pct = bps / 100;
    return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  }, [tvlWei, deployedWei]);

  const tvlDisplay = useMemo(() => {
    const num = Number(formatAssetAmount(tvlWei));
    return Number.isFinite(num)
      ? num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '0.00';
  }, [tvlWei, formatAssetAmount]);

  const VAULT_CAPACITY_WEI = parseUnits(DEPOSIT_CAP.toString(), assetDecimals);

  const exceedsVaultCapacity = useMemo(() => {
    const newTotal = tvlWei + depositWei;
    return newTotal > VAULT_CAPACITY_WEI;
  }, [tvlWei, depositWei, VAULT_CAPACITY_WEI]);

  const capPercentOfTvl = useMemo(() => {
    if (tvlWei <= 0n) return 100;
    const pct = Number((VAULT_CAPACITY_WEI * 10000n) / tvlWei) / 100;
    return Math.max(0, Math.min(100, pct));
  }, [tvlWei, VAULT_CAPACITY_WEI]);

  const depositCapDisplay = DEPOSIT_CAP.toLocaleString('en-US');

  const tvlPercentOfCap = useMemo(() => {
    if (VAULT_CAPACITY_WEI <= 0n) return 0;
    const pct = Number((tvlWei * 10000n) / VAULT_CAPACITY_WEI) / 100;
    return Math.max(0, Math.min(100, pct));
  }, [tvlWei, VAULT_CAPACITY_WEI]);

  const deployedDisplay = useMemo(() => {
    const num = Number(formatAssetAmount(deployedWei));
    return Number.isFinite(num)
      ? num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '0.00';
  }, [deployedWei, formatAssetAmount]);

  const deployedPercentOfCap = useMemo(() => {
    if (VAULT_CAPACITY_WEI <= 0n) return 0;
    const pct = Number((deployedWei * 10000n) / VAULT_CAPACITY_WEI) / 100;
    return Math.max(0, Math.min(100, pct));
  }, [deployedWei, VAULT_CAPACITY_WEI]);

  const isWhitelisted =
    DEPOSIT_WHITELIST.length === 0 ||
    (currentAddress &&
      DEPOSIT_WHITELIST.includes(
        currentAddress.toLowerCase() as `0x${string}`
      ));

  const utilizationDisplay = `${utilizationPercent.toFixed(2)}%`;

  const yieldMetrics = useMemo(() => {
    // Rewards are paid from the protocol-wide Ethena yield and are shared
    // among every vault's LPs. Calc must be identical regardless of which
    // tab is selected — sum TVL across all deployed vaults.
    const vaultEntries = [
      [coreVault.vaultData, coreStats] as const,
      [singleLegVaultData.vaultData, singleLegStats] as const,
      [edgeVault.vaultData, edgeStats] as const,
    ];
    const totalVaultTvlWei = vaultEntries.reduce((sum, [v, stats]) => {
      const liquid = v?.totalLiquidValue ?? 0n;
      const lastStat = stats?.[stats.length - 1];
      const deployed = lastStat?.vaultDeployed
        ? BigInt(lastStat.vaultDeployed)
        : 0n;
      return sum + liquid + deployed;
    }, 0n);

    // Protocol TVL = escrow (protocol-wide, same across all vault queries) +
    // undeployed assets summed across every vault. Sourcing from the selected
    // vault's stats zeros out when we switch to a vault with no stats yet.
    const escrowWei = (() => {
      for (const [, stats] of vaultEntries) {
        const last = stats?.[stats.length - 1];
        if (last?.escrowBalance) return BigInt(last.escrowBalance);
      }
      return 0n;
    })();
    const vaultAvailableWei = vaultEntries.reduce((sum, [, stats]) => {
      const last = stats?.[stats.length - 1];
      return (
        sum +
        (last?.vaultAvailableAssets ? BigInt(last.vaultAvailableAssets) : 0n)
      );
    }, 0n);
    const protocolTvlWei = escrowWei + vaultAvailableWei;
    const protocolTvlNum = Number(formatAssetAmount(protocolTvlWei));
    const totalVaultTvlNum = Number(formatAssetAmount(totalVaultTvlWei));

    const effectiveApy =
      totalVaultTvlNum > 0
        ? (protocolTvlNum / totalVaultTvlNum) * ETHENA_BASE_APY
        : 0;
    const annualYieldToVaults = totalVaultTvlNum * (effectiveApy / 100);
    const weeklyYield = (annualYieldToVaults / 365) * 7;

    const fmt = (n: number) =>
      Number.isFinite(n)
        ? n.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '0.00';

    return {
      protocolTvl: fmt(protocolTvlNum),
      annualYield: fmt(annualYieldToVaults),
      weeklyYield: fmt(weeklyYield),
      effectiveApy: effectiveApy.toFixed(2),
    };
  }, [
    coreVault.vaultData,
    singleLegVaultData.vaultData,
    edgeVault.vaultData,
    coreStats,
    singleLegStats,
    edgeStats,
    formatAssetAmount,
  ]);

  return (
    <div className="relative">
      <div className="container max-w-[600px] lg:max-w-[1200px] mx-auto px-4 pt-10 md:pt-14 lg:pt-10 pb-12 relative z-10">
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <h1 className="text-3xl md:text-5xl font-sans font-normal text-foreground">
            Vaults
          </h1>
          <Tabs value={selectedVaultValue} onValueChange={handleVaultChange}>
            <TabsList className="h-auto p-1">
              {vaultOptions.map((option) => (
                <TabsTrigger
                  key={option.address}
                  value={option.address}
                  className="text-sm px-3 py-1.5 data-[state=active]:text-brand-white"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div>
            <Card className="relative bg-brand-black border border-brand-white/10 rounded-none shadow-sm">
              <div
                className="hidden lg:block absolute top-0 left-0 right-0 h-px"
                style={{ background: categoryGradient }}
              />
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-2xl font-medium">{vaultTitle}</h3>
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

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-6 order-2 lg:order-1 lg:min-h-0">
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10">
                        <h4 className="font-mono text-base uppercase tracking-wider text-brand-white mb-3 sm:mb-2">
                          Vault Balance
                          <br className="sm:hidden" />{' '}
                          {isBalanceReady && (
                            <span className="font-medium text-[hsl(var(--ethena))] animate-in fade-in duration-200">
                              {tvlDisplay} {collateralSymbol}
                            </span>
                          )}
                        </h4>
                        <div
                          className={`relative ${isBalanceReady ? 'animate-in fade-in duration-200' : ''}`}
                        >
                          {isBalanceReady ? (
                            <>
                              {tvlWei <= VAULT_CAPACITY_WEI && (
                                <div className="absolute -top-4 right-0 font-mono text-[10px] text-muted-foreground/50 uppercase">
                                  {depositCapDisplay} cap
                                </div>
                              )}
                              <div
                                data-testid="vault-balance-bar"
                                className="w-full h-3 rounded-sm bg-[hsl(var(--primary)/_0.09)] overflow-hidden shadow-inner relative"
                              >
                                <div
                                  className="h-3 bg-accent-gold rounded-sm transition-all gold-sheen"
                                  style={{
                                    width: `${tvlWei > VAULT_CAPACITY_WEI ? 100 : tvlPercentOfCap}%`,
                                  }}
                                />
                                <div
                                  className="absolute top-0 left-0 h-3 rounded-sm bg-brand-white transition-all"
                                  style={{
                                    width: `${tvlWei > VAULT_CAPACITY_WEI ? deployedPercentOfCap : Math.min(deployedPercentOfCap, tvlPercentOfCap)}%`,
                                  }}
                                />
                              </div>
                              {tvlWei > VAULT_CAPACITY_WEI && (
                                <>
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
                            </>
                          ) : (
                            <div className="w-full h-3 rounded-sm bg-[hsl(var(--primary)/_0.09)] animate-pulse" />
                          )}
                        </div>
                        <div className="mt-2 flex flex-col items-start sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-0 text-sm">
                          <span
                            className={`font-mono text-muted-foreground uppercase ${isBalanceReady ? 'animate-in fade-in duration-200' : ''}`}
                          >
                            {isBalanceReady && (
                              <>
                                {deployedDisplay} {collateralSymbol} (
                                {utilizationDisplay}) deployed
                              </>
                            )}
                          </span>
                          <Link
                            href={`/profile/${VAULT_ADDRESS}`}
                            className="text-sm gold-link"
                          >
                            View Profile
                          </Link>
                        </div>
                      </div>

                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10 lg:flex-1 lg:flex lg:flex-col lg:min-h-0 lg:overflow-hidden">
                        <VaultPnlChart
                          protocolStats={protocolStats ?? undefined}
                          isLoading={isAnalyticsLoading}
                          chartAnchorSec={getVaultPnlAnchorSec(VAULT_ADDRESS)}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-6 order-1 lg:order-2">
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
                                        <NumberDisplay
                                          value={Number(
                                            formatAssetAmount(
                                              pendingRequest.assets
                                            )
                                          )}
                                          decimals={2}
                                        />{' '}
                                        {collateralSymbol}
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
