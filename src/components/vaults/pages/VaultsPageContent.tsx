'use client';

import { Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseUnits } from 'viem';
import { formatDuration, intervalToDuration } from 'date-fns';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';
import { Input } from '~/components/ui/input';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
  predictionMarketVault,
  predictionMarketVaultStrategyB,
  pythPredictionMarketVault,
  singleLegVault,
} from '~/lib/sdk/contracts';
import {
  DEFAULT_CHAIN_ID,
  COLLATERAL_SYMBOLS,
  isRobinhoodChain,
} from '~/lib/sdk/constants';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import {
  useVaultStats,
  useVaultAccountValue,
} from '~/hooks/graphql/useAnalytics';
import VaultPnlChart from '~/components/vaults/VaultPnlChart';
import VaultSharePriceChart from '~/components/vaults/VaultSharePriceChart';

// Compared against a lowercased address, so these must be lowercase — a
// checksummed entry here silently never matches and locks that user out.
const DEPOSIT_WHITELIST: `0x${string}`[] = [
  '0xdb5af497a73620d881561edb508012a5f84e9ba2',
  '0x7bb4e4e4674c625b23c550a74cfcff9ec50064f3',
];

const DEPOSIT_CAP = 50000;

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
  const isRobinhood = isRobinhoodChain(VAULT_CHAIN_ID);

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
        'Singles Vault',
      ],
    ];
    return entries
      .filter((entry): entry is [`0x${string}`, string] => Boolean(entry[0]))
      .map(([address, label]) => ({ address, label }));
  }, [VAULT_CHAIN_ID]);

  const knownVaultOptions = useMemo<VaultOption[]>(() => {
    const hiddenEntries: Array<[`0x${string}` | undefined, string]> = [
      [
        pythPredictionMarketVault[VAULT_CHAIN_ID]?.address as
          | `0x${string}`
          | undefined,
        'Options Vault',
      ],
    ];
    const hiddenVaultOptions = hiddenEntries
      .filter((entry): entry is [`0x${string}`, string] => Boolean(entry[0]))
      .map(([address, label]) => ({ address, label }));
    return [...vaultOptions, ...hiddenVaultOptions];
  }, [VAULT_CHAIN_ID, vaultOptions]);

  const queryVault = normalizeAddress(searchParams.get(VAULT_QUERY_PARAM));
  const hasVaultQueryParam = queryVault !== '';
  const selectedVault = useMemo(() => {
    const match = knownVaultOptions.find(
      (v) => normalizeAddress(v.address) === queryVault
    );
    if (match) return match;
    // An unrecognized but well-formed address is treated as a custom vault so
    // deposit/withdraw work against vaults not in the SDK registry (e.g. on a
    // custom chain). `queryVault` is lowercased, so validate without checksum.
    if (queryVault && isAddress(queryVault, { strict: false })) {
      return {
        address: queryVault,
        label: 'Custom Vault',
      };
    }
    return vaultOptions[0];
  }, [queryVault, knownVaultOptions, vaultOptions]);

  const isCustomVault = useMemo(
    () =>
      !!selectedVault &&
      !knownVaultOptions.some(
        (v) =>
          normalizeAddress(v.address) ===
          normalizeAddress(selectedVault.address)
      ),
    [selectedVault, knownVaultOptions]
  );
  const [customVaultInput, setCustomVaultInput] = useState('');

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

  const {
    vaultData,
    userData,
    pendingRequest,
    vaultCollateralBalance,
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

  // `isAnalyticsLoading` tracks the vault-stats query that feeds the PnL chart,
  // so its loader matches the data it renders. The balance display gates on `vaultAccountValue`
  // separately via `isBalanceReady` below.
  const {
    data: vaultStats,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
  } = useVaultStats(VAULT_ADDRESS);
  const { data: vaultAccountValue } = useVaultAccountValue(VAULT_ADDRESS);

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState('deposit');
  const [activeChart, setActiveChart] = useState<'pnl' | 'sharePrice'>('pnl');
  const [pendingAction, setPendingAction] = useState<
    'deposit' | 'withdraw' | 'cancelDeposit' | 'cancelWithdrawal' | undefined
  >(undefined);

  // Switching vaults keeps the same mounted form, so its inputs/tab/in-flight
  // state would otherwise carry over and be applied against the newly selected
  // vault's price, balances, and allowance. Reset everything when the vault
  // address changes so the form always reflects the vault it's pointed at.
  useEffect(() => {
    setDepositAmount('');
    setWithdrawAmount('');
    setActiveTab('deposit');
    setPendingAction(undefined);
  }, [VAULT_ADDRESS]);

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
    if (!userAssetBalance || !assetDecimals) return '0.00';
    // Truncate (never round up) to 2 decimals so MAX never sets an amount
    // greater than the real balance and trips the balance guard below.
    const scale = 10n ** BigInt(assetDecimals);
    const whole = userAssetBalance / scale;
    const hundredths = ((userAssetBalance % scale) * 100n) / scale;
    return `${whole.toString()}.${hundredths.toString().padStart(2, '0')}`;
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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
              // Block deposits until the indexed AUM has loaded: while it is
              // still loading `tvlWei` reads 0, so `exceedsVaultCapacity`
              // understates the true total and a near-cap vault could let an
              // over-cap deposit through the client check.
              (isConnected &&
                !!depositAmount &&
                (!isBalanceReady ||
                  exceedsVaultCapacity ||
                  depositExceedsBalance ||
                  // The quote signs `pricePerShare`, which sets the slippage
                  // floor (`expectedSharesWei`). An unsigned or wrongly-signed
                  // quote can inflate it so the user under-requests shares —
                  // and asking for too few always passes the manager's on-chain
                  // check, so nothing downstream catches it. The label already
                  // says "Waiting for Price Quote"; make it actually block.
                  quoteSignatureValid !== true)) ||
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
              if (!isConnected) return 'Connect Wallet';
              if (!isWhitelisted) return 'Request Early Access';
              if (isInteractionDelayActive) return 'Cooldown in progress';
              if (depositAmount && depositExceedsBalance)
                return 'Insufficient Balance';
              if (depositAmount && exceedsVaultCapacity)
                return 'Exceeds Vault Capacity';
              if (depositAmount && quoteSignatureValid !== true)
                return 'Waiting for Price Quote';
              if (!pricePerShare || pricePerShare === '0')
                return 'Cannot connect to vault';
              if (requiresApproval) return 'Approve & Deposit';
              return 'Submit Deposit';
            })()}
          </Button>
        </div>
        {interactionDelay > 0n && depositAmount && (
          <div className="text-xs text-muted-foreground text-center">
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
              (isConnected &&
                (withdrawExceedsShareBalance ||
                  // Same reasoning as deposit: `pricePerShare` sets
                  // `expectedAssetsWei`, the withdrawal slippage floor.
                  quoteSignatureValid !== true))
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
              if (!isConnected) return 'Connect Wallet';
              if (withdrawExceedsShareBalance) return 'Insufficient Balance';
              if (isInteractionDelayActive) return 'Cooldown in progress';
              if (withdrawAmount && quoteSignatureValid !== true)
                return 'Waiting for Price Quote';
              if (!pricePerShare || pricePerShare === '0')
                return 'Cannot connect to vault';
              return 'Request Withdrawal';
            })()}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );

  const deployedWei = vaultAccountValue?.deployedCollateral
    ? BigInt(vaultAccountValue.deployedCollateral)
    : 0n;

  const claimableWei = vaultAccountValue?.claimableCollateral
    ? BigInt(vaultAccountValue.claimableCollateral)
    : 0n;

  // Vault AUM = collateral actually in the vault contract (liquid) + collateral
  // deployed in open positions + settled/won collateral owed but not yet claimed.
  // The liquid term is read live on-chain (`vaultCollateralBalance`, the asset's
  // balanceOf(vault)) so a deposit/cancel/withdrawal is reflected immediately,
  // rather than waiting on the periodic indexer snapshot. The escrow-held terms
  // (deployed + claimable) still come from the indexer since they can't be read
  // cheaply on-chain. Falls back to the indexer's totalValue until the on-chain
  // read resolves.
  const tvlWei =
    vaultCollateralBalance !== undefined
      ? vaultCollateralBalance + deployedWei + claimableWei
      : vaultAccountValue?.totalValue
        ? BigInt(vaultAccountValue.totalValue)
        : 0n;

  const isBalanceReady =
    vaultCollateralBalance !== undefined || !!vaultAccountValue;

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
    // Robinhood chains have no deposit cap.
    if (isRobinhood) return false;
    const newTotal = tvlWei + depositWei;
    return newTotal > VAULT_CAPACITY_WEI;
  }, [isRobinhood, tvlWei, depositWei, VAULT_CAPACITY_WEI]);

  // Block deposits that exceed the connected wallet's collateral balance.
  const depositExceedsBalance = depositWei > (userAssetBalance ?? 0n);

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

  return (
    <div className="relative">
      <div className="container max-w-[600px] lg:max-w-[1200px] mx-auto px-4 pt-10 md:pt-14 lg:pt-10 pb-12 relative z-10">
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <h1 className="text-3xl md:text-5xl font-sans font-normal text-foreground">
            Vaults
          </h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {vaultOptions.length > 0 ? (
              <Tabs
                value={selectedVaultValue}
                onValueChange={handleVaultChange}
              >
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
            ) : null}
            {(vaultOptions.length === 0 || isCustomVault) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Input
                  value={customVaultInput}
                  onChange={(e) => setCustomVaultInput(e.target.value)}
                  placeholder="Custom vault address (0x…)"
                  className="sm:w-72 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !isAddress(customVaultInput.trim(), { strict: false })
                  }
                  onClick={() => handleVaultChange(customVaultInput.trim())}
                >
                  Load Vault
                </Button>
              </div>
            )}
          </div>
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
                    <div className="flex flex-col order-2 lg:order-1 lg:min-h-0">
                      <div className="p-5 pt-4 rounded-lg bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10 lg:flex-1 lg:flex lg:flex-col lg:min-h-[360px] lg:overflow-hidden">
                        {activeChart === 'pnl' ? (
                          <VaultPnlChart
                            vaultStats={vaultStats ?? undefined}
                            isLoading={isAnalyticsLoading}
                            isError={isAnalyticsError}
                            className="flex-1"
                            onToggleChart={() => setActiveChart('sharePrice')}
                          />
                        ) : (
                          <VaultSharePriceChart
                            vaultStats={vaultStats ?? undefined}
                            vaultAddress={VAULT_ADDRESS}
                            chainId={VAULT_CHAIN_ID}
                            isLoading={isAnalyticsLoading}
                            isError={isAnalyticsError}
                            className="flex-1"
                            onToggleChart={() => setActiveChart('pnl')}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-6 order-1 lg:order-2">
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
                              {!isRobinhood && tvlWei <= VAULT_CAPACITY_WEI && (
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
                              {!isRobinhood && tvlWei > VAULT_CAPACITY_WEI && (
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
