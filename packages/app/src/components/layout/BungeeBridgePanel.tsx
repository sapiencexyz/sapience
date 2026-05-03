'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useBalance,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
} from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { erc20Abi, formatUnits, parseUnits, type Address } from 'viem';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { ArrowDown, ChevronDown, Loader2 } from 'lucide-react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  BUNGEE_NATIVE_TOKEN,
  BUNGEE_SOURCE_CHAIN_META,
  BUNGEE_TOKEN_COINGECKO_IDS,
  describeBungeeStatus,
  fetchBungeeQuote,
  fetchBungeeStatus,
  fetchBungeeTokens,
  isBungeeSuccess,
  isBungeeTerminal,
  selectBungeeSourceTokens,
  type BungeeDeposit,
  type BungeeSourceToken,
  type BungeeStatusEntry,
} from '~/lib/bungee';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useBridgeTracker } from '~/hooks/useBridgeTracker';
import type { BridgeRecord } from '~/lib/bridgeTracker';

type RecipientMode = 'smartAccount' | 'eoa';

interface BungeeBridgePanelProps {
  eoaAddress?: Address;
  smartAccountAddress?: Address;
  collateralSymbol?: string;
  isCalculatingAddress?: boolean;
  /**
   * Which destination is preselected — typically derived from whether the user
   * is in smart-account or wallet mode in the app. The user can override via
   * the in-panel toggle.
   */
  defaultRecipient?: RecipientMode;
}

const QUOTE_REFRESH_MS = 30_000;
const STATUS_POLL_MS = 5_000;
const NATIVE_PRICE_REFRESH_MS = 60_000;
const TOKEN_LIST_REFRESH_MS = 10 * 60_000;

interface SourceCombo {
  key: string;
  chainId: number;
  chainName: string;
  chainIconUrl: string;
  token: BungeeSourceToken;
}

const STABLE_PRICE_USD: Record<string, number> = {
  USDe: 1,
  USDC: 1,
  USDT: 1,
  DAI: 1,
};

const SOURCE_CHAIN_IDS = BUNGEE_SOURCE_CHAIN_META.map((c) => c.chainId);

// Keep native-token max sends below the full balance so the wallet can still
// pay source-chain gas for the deposit transaction. ERC-20 routes still need
// native gas too, but their token balance is independent of that gas budget.
const NATIVE_GAS_RESERVE_WEI_BY_CHAIN_ID: Record<number, bigint> = {
  1: 10_000_000_000_000_000n, // 0.01 ETH (Ethereum)
  42161: 1_000_000_000_000_000n, // 0.001 ETH (Arbitrum)
  8453: 500_000_000_000_000n, // 0.0005 ETH (Base)
  56: 5_000_000_000_000_000n, // 0.005 BNB
  999: 10_000_000_000_000_000n, // 0.01 HYPE
};

function getNativeGasReserveWei(chainId: number | undefined): bigint {
  return chainId == null
    ? 0n
    : (NATIVE_GAS_RESERVE_WEI_BY_CHAIN_ID[chainId] ?? 0n);
}

function maxBigInt(value: bigint, floor: bigint): bigint {
  return value > floor ? value : floor;
}

function formatBalance(value: number, maxDecimals = 4): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

function formatUsd(value: number): string {
  if (value === 0) return '—';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatAmountForInput(
  value: bigint,
  decimals: number,
  maxDecimals = 6
): string {
  const formatted = formatUnits(value, decimals);
  const [whole, dec = ''] = formatted.split('.');
  const trimmed = dec.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

// Fetch USD prices for every non-stable allowlisted symbol in one CoinGecko
// call. Returns a map keyed by symbol (e.g. ETH, BNB, HYPE, cbBTC).
async function fetchNativeUsdPrices(
  signal?: AbortSignal
): Promise<Record<string, number>> {
  const ids = Object.values(BUNGEE_TOKEN_COINGECKO_IDS);
  if (ids.length === 0) return {};
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
    { signal }
  );
  if (!res.ok) return {};
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [symbol, id] of Object.entries(BUNGEE_TOKEN_COINGECKO_IDS)) {
    out[symbol] = Number(json[id]?.usd ?? 0);
  }
  return out;
}

export default function BungeeBridgePanel({
  eoaAddress,
  smartAccountAddress,
  collateralSymbol = 'USDe',
  isCalculatingAddress,
  defaultRecipient = 'smartAccount',
}: BungeeBridgePanelProps) {
  const { chain: activeChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { bridges, addBridge } = useBridgeTracker();

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState<RecipientMode>(defaultRecipient);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // If the prop changes (e.g. user switches account mode while the dialog is
  // open), reflect that.
  const lastDefaultRecipient = useRef(defaultRecipient);
  useEffect(() => {
    if (lastDefaultRecipient.current === defaultRecipient) return;
    lastDefaultRecipient.current = defaultRecipient;
    setRecipient(defaultRecipient);
  }, [defaultRecipient]);

  // Resolve the active receiver address. Falls back to EOA if SA isn't ready.
  const resolvedReceiver: Address | undefined =
    recipient === 'smartAccount'
      ? (smartAccountAddress ?? undefined)
      : eoaAddress;
  const recipientLabel =
    recipient === 'smartAccount' ? 'Sapience Account' : 'Ethereal Account';

  // Bungee's trending list per chain — feeds the source picker. Cached for
  // the session; tokens we expose via the allowlist don't churn meaningfully
  // within a user's session.
  const { data: tokensData } = useQuery({
    queryKey: ['bungee-tokens', SOURCE_CHAIN_IDS.join(',')],
    queryFn: ({ signal }) => fetchBungeeTokens(SOURCE_CHAIN_IDS, signal),
    staleTime: TOKEN_LIST_REFRESH_MS,
  });

  const allCombos = useMemo<SourceCombo[]>(() => {
    if (!tokensData?.result) return [];
    return BUNGEE_SOURCE_CHAIN_META.flatMap((meta) => {
      const apiTokens = tokensData.result[String(meta.chainId)] ?? [];
      return selectBungeeSourceTokens(apiTokens).map((t) => ({
        key: `${meta.chainId}:${t.symbol}`,
        chainId: meta.chainId,
        chainName: meta.name,
        chainIconUrl: meta.iconUrl,
        token: t,
      }));
    });
  }, [tokensData]);

  // Once the token list arrives, lock in a default selection so the picker
  // is never empty. The auto-balance effect below may override this with the
  // user's largest holding.
  useEffect(() => {
    if (selectedKey) return;
    if (allCombos.length === 0) return;
    setSelectedKey(allCombos[0].key);
  }, [selectedKey, allCombos]);

  const selectedCombo: SourceCombo | undefined =
    allCombos.find((c) => c.key === selectedKey) ?? allCombos[0];
  const sourceChainId = selectedCombo?.chainId;
  const sourceToken = selectedCombo?.token;

  const inputAmountWei = useMemo(() => {
    if (!amount || !sourceToken) return null;
    try {
      const parsed = parseUnits(amount, sourceToken.decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount, sourceToken]);

  // Batch ERC20 balances across all chains in one wagmi multicall set.
  const erc20Combos = useMemo(
    () => allCombos.filter((c) => !c.token.isNative),
    [allCombos]
  );
  const { data: erc20BalancesData } = useReadContracts({
    contracts: erc20Combos.map((c) => ({
      chainId: c.chainId,
      address: c.token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: eoaAddress ? [eoaAddress] : undefined,
    })),
    query: { enabled: !!eoaAddress && erc20Combos.length > 0 },
  });

  // Native balances — one useBalance per supported chain. Static count keeps
  // hooks consistent across renders. Order must match BUNGEE_SOURCE_CHAIN_META.
  const nativeBalEthereum = useBalance({
    chainId: 1,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalArbitrum = useBalance({
    chainId: 42161,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalBase = useBalance({
    chainId: 8453,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalBsc = useBalance({
    chainId: 56,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalHyperEvm = useBalance({
    chainId: 999,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalanceByChainId: Record<number, bigint> = {
    1: nativeBalEthereum.data?.value ?? 0n,
    42161: nativeBalArbitrum.data?.value ?? 0n,
    8453: nativeBalBase.data?.value ?? 0n,
    56: nativeBalBsc.data?.value ?? 0n,
    999: nativeBalHyperEvm.data?.value ?? 0n,
  };
  const nativeBalancesLoading =
    nativeBalEthereum.isLoading ||
    nativeBalArbitrum.isLoading ||
    nativeBalBase.isLoading ||
    nativeBalBsc.isLoading ||
    nativeBalHyperEvm.isLoading;

  const { data: nativePricesUsd } = useQuery({
    queryKey: ['bungee-native-prices'],
    queryFn: ({ signal }) => fetchNativeUsdPrices(signal),
    staleTime: NATIVE_PRICE_REFRESH_MS,
    refetchInterval: NATIVE_PRICE_REFRESH_MS,
    enabled: allCombos.some(
      (c) => BUNGEE_TOKEN_COINGECKO_IDS[c.token.symbol] !== undefined
    ),
  });

  const combosWithBalance = useMemo(() => {
    return allCombos.map((c) => {
      let raw: bigint;
      if (c.token.isNative) {
        raw = nativeBalanceByChainId[c.chainId] ?? 0n;
      } else {
        const idx = erc20Combos.findIndex((e) => e.key === c.key);
        raw = (erc20BalancesData?.[idx]?.result as bigint | undefined) ?? 0n;
      }
      const balance = Number(formatUnits(raw, c.token.decimals));
      const priceUsd =
        STABLE_PRICE_USD[c.token.symbol] ??
        nativePricesUsd?.[c.token.symbol] ??
        0;
      return { ...c, raw, balance, valueUsd: balance * priceUsd };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allCombos,
    erc20Combos,
    erc20BalancesData,
    nativeBalEthereum.data?.value,
    nativeBalArbitrum.data?.value,
    nativeBalBase.data?.value,
    nativeBalBsc.data?.value,
    nativeBalHyperEvm.data?.value,
    nativePricesUsd,
  ]);

  const sortedCombos = useMemo(
    () =>
      [...combosWithBalance].sort((a, b) => {
        if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
        return b.balance - a.balance;
      }),
    [combosWithBalance]
  );

  // Hide zero-balance combos from the dropdown but always keep the selected
  // one visible so the chip stays in sync. If everything is zero (e.g. brand
  // new wallet), fall back to showing all so the picker isn't empty.
  const visibleCombos = useMemo(() => {
    const nonZero = sortedCombos.filter(
      (c) => c.balance > 0 || c.key === selectedKey
    );
    return nonZero.length > 0 ? nonZero : sortedCombos;
  }, [sortedCombos, selectedKey]);

  const selectedComboData =
    combosWithBalance.find((c) => c.key === selectedKey) ??
    combosWithBalance[0];
  const sourceBalance = selectedComboData?.raw ?? 0n;
  const nativeGasReserveWei = sourceToken?.isNative
    ? getNativeGasReserveWei(sourceChainId)
    : 0n;
  const maxSpendableSourceBalance = sourceToken?.isNative
    ? maxBigInt(sourceBalance - nativeGasReserveWei, 0n)
    : sourceBalance;
  const sourceBalanceNum = selectedComboData?.balance ?? 0;
  const maxSpendableSourceBalanceNum = sourceToken
    ? Number(formatUnits(maxSpendableSourceBalance, sourceToken.decimals))
    : 0;

  // On first balance load, auto-pick the highest-balance combo so users don't
  // have to hunt for their funds. Only fires once.
  const initialAutoSelectDone = useRef(false);
  useEffect(() => {
    if (initialAutoSelectDone.current) return;
    if (!eoaAddress) return;
    if (allCombos.length === 0) return;
    if (!erc20BalancesData) return;
    if (nativeBalancesLoading) return;
    const top = sortedCombos[0];
    if (top && top.valueUsd > 0) setSelectedKey(top.key);
    initialAutoSelectDone.current = true;
  }, [
    eoaAddress,
    allCombos.length,
    erc20BalancesData,
    nativeBalancesLoading,
    sortedCombos,
  ]);

  // Auto-fill amount with the EOA's max spendable source balance once per
  // combo. Native tokens reserve a small gas buffer so Max doesn't create an
  // unfundable transaction. Doesn't overwrite later balance refetches so the
  // user can still type freely.
  const lastAutoFillKey = useRef<string>('');
  useEffect(() => {
    if (!sourceToken) return;
    const key = `${selectedKey}|${eoaAddress ?? ''}`;
    if (lastAutoFillKey.current === key) return;
    const balanceLoaded = sourceToken.isNative
      ? !nativeBalancesLoading
      : erc20BalancesData !== undefined;
    if (!balanceLoaded) return;
    setAmount(
      maxSpendableSourceBalance > 0n
        ? formatAmountForInput(maxSpendableSourceBalance, sourceToken.decimals)
        : ''
    );
    lastAutoFillKey.current = key;
  }, [
    selectedKey,
    eoaAddress,
    sourceToken,
    maxSpendableSourceBalance,
    erc20BalancesData,
    nativeBalancesLoading,
  ]);

  const quoteEnabled =
    !!eoaAddress &&
    !!resolvedReceiver &&
    !!sourceToken &&
    sourceChainId !== undefined &&
    !!inputAmountWei &&
    inputAmountWei > 0n;

  const {
    data: quote,
    isFetching: isQuoting,
    error: quoteError,
    refetch: refetchQuote,
  } = useQuery({
    queryKey: [
      'bungee-quote',
      sourceChainId,
      sourceToken?.address,
      inputAmountWei?.toString(),
      eoaAddress,
      resolvedReceiver,
    ],
    queryFn: ({ signal }) =>
      fetchBungeeQuote(
        {
          originChainId: sourceChainId,
          destinationChainId: DEFAULT_CHAIN_ID,
          inputToken: sourceToken.address,
          outputToken: BUNGEE_NATIVE_TOKEN,
          inputAmount: inputAmountWei!.toString(),
          userAddress: eoaAddress!,
          receiverAddress: resolvedReceiver!,
          refundAddress: eoaAddress!,
        },
        signal
      ),
    enabled: quoteEnabled,
    staleTime: 15_000,
    refetchInterval: quoteEnabled ? QUOTE_REFRESH_MS : false,
    retry: 1,
  });

  const deposit: BungeeDeposit | undefined = quote?.result?.deposit;
  const noRouteAvailable =
    !!quote && !deposit && !!inputAmountWei && !isQuoting;

  // Quotes carry an expiry (unix seconds). Track current time so the disabled
  // state and auto-refetch react as the deadline passes — without this, a user
  // who dwells on the dialog could submit `txData` Bungee no longer accepts.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!deposit?.expiry) return;
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [deposit?.expiry]);
  const isQuoteExpired = !!deposit?.expiry && deposit.expiry <= nowSec;

  // Refresh the quote as soon as it expires, so the Bridge button never sits
  // wired to stale txData.
  useEffect(() => {
    if (!isQuoteExpired) return;
    if (isQuoting || isSending) return;
    refetchQuote();
  }, [isQuoteExpired, isQuoting, isSending, refetchQuote]);

  const handleBridge = async () => {
    if (!deposit || !eoaAddress || sourceChainId === undefined) return;
    // Last-line guard: expiry could have lapsed between render and click.
    if (deposit.expiry > 0 && deposit.expiry <= Math.floor(Date.now() / 1000)) {
      refetchQuote();
      return;
    }
    setErrorMsg(null);
    setIsSending(true);
    try {
      if (activeChain?.id !== sourceChainId) {
        await switchChainAsync({ chainId: sourceChainId });
      }
      await sendTransactionAsync({
        chainId: sourceChainId,
        to: deposit.txData.to,
        data: deposit.txData.data,
        value: BigInt(deposit.txData.value),
      });
      // Hand off to the tracker — the BridgeReconciler now owns status
      // polling, the success/failure toast, and the balance refetches.
      addBridge(deposit.requestHash, recipient);
      setAmount('');
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setErrorMsg(err.shortMessage || err.message || 'Transaction failed');
    } finally {
      setIsSending(false);
    }
  };

  const insufficientFunds =
    !!inputAmountWei && inputAmountWei > maxSpendableSourceBalance;
  const insufficientFundsLabel = sourceToken?.isNative
    ? 'Insufficient balance after gas reserve'
    : 'Insufficient balance';

  const outputAmount = deposit
    ? Number(formatUnits(BigInt(deposit.output.amount), 18))
    : null;
  const minOut = deposit
    ? Number(formatUnits(BigInt(deposit.output.minAmountOut), 18))
    : null;
  const feePct = deposit ? Number(deposit.totalFeeBps) / 100 : null;
  const eta = deposit?.estimatedTime;

  // Inputs stay live — users can stack a second bridge while the first is
  // still settling. The wallet will sequence by nonce. Only the brief moment
  // while we wait for a wallet confirmation locks the form.
  const inputsLocked = isSending;

  const buttonLabel = (() => {
    if (isSending) return 'Confirm in wallet…';
    if (isQuoting && !deposit) return 'Getting quote…';
    if (insufficientFunds) return insufficientFundsLabel;
    if (!inputAmountWei) return 'Enter an amount';
    if (!deposit) return 'No route available';
    if (isQuoteExpired)
      return isQuoting ? 'Refreshing quote…' : 'Quote expired';
    return `Bridge to ${recipientLabel}`;
  })();

  const buttonDisabled =
    isSending ||
    !deposit ||
    insufficientFunds ||
    !inputAmountWei ||
    isQuoteExpired;

  const setAmountFraction = (fraction: number) => {
    if (!sourceToken || maxSpendableSourceBalance === 0n) return;
    const value =
      fraction === 1
        ? maxSpendableSourceBalance
        : (maxSpendableSourceBalance * BigInt(Math.floor(fraction * 10_000))) /
          10_000n;
    setAmount(formatAmountForInput(value, sourceToken.decimals));
  };

  return (
    <div className="space-y-3 min-w-0">
      {/* In-progress bridges. The reconciler polls these regardless of
          whether the dialog is open; the rows surface them here when it is. */}
      {bridges.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
            In progress
          </div>
          {bridges.map((b) => (
            <BridgeRow key={b.requestHash} record={b} />
          ))}
        </div>
      )}

      {/* Amount card */}
      <div className="rounded-lg border-2 border-ethena/40 bg-muted/20 p-4 space-y-3 shadow-[0_0_12px_rgba(136,180,245,0.1)]">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-muted-foreground shrink-0">From</span>
            {eoaAddress ? (
              <span className="flex items-center gap-1 min-w-0 truncate">
                <EnsAvatar address={eoaAddress} width={14} height={14} />
                <AddressDisplay address={eoaAddress} compact />
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setAmountFraction(0.5)}
              disabled={inputsLocked || maxSpendableSourceBalance === 0n}
              className="px-2 py-0.5 text-xs bg-muted/60 hover:bg-muted rounded disabled:opacity-50"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => setAmountFraction(1)}
              disabled={inputsLocked || maxSpendableSourceBalance === 0n}
              className="px-2 py-0.5 text-xs bg-muted/60 hover:bg-muted rounded disabled:opacity-50"
            >
              Max:{' '}
              {formatBalance(
                sourceToken?.isNative
                  ? maxSpendableSourceBalanceNum
                  : sourceBalanceNum,
                sourceToken?.isNative ? 4 : 2
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 min-w-0">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={inputsLocked}
            size={1}
            className="bg-transparent text-3xl font-mono outline-none flex-1 min-w-0 w-0 placeholder:text-muted-foreground/40 disabled:opacity-50"
          />
          <Select
            value={selectedKey}
            onValueChange={setSelectedKey}
            disabled={inputsLocked}
          >
            <SelectTrigger className="bg-background/60 hover:bg-background rounded-md h-auto w-auto border-border/60 pl-1.5 pr-2 py-1.5 gap-1.5 [&>span]:!overflow-visible">
              <SelectValue>
                {selectedComboData &&
                  renderTokenChipInner(
                    selectedComboData.token.iconUrl,
                    selectedComboData.chainIconUrl,
                    selectedComboData.token.symbol
                  )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {visibleCombos.map((c) => (
                <SelectItem
                  key={c.key}
                  value={c.key}
                  className="py-2.5 px-3 [&>span:first-child]:hidden [&>span:last-child]:flex-1"
                >
                  <div className="flex items-center gap-3 w-full pr-2">
                    <div className="relative flex-shrink-0">
                      <img
                        src={c.token.iconUrl}
                        alt=""
                        className="w-7 h-7 rounded-full"
                      />
                      <img
                        src={c.chainIconUrl}
                        alt=""
                        className="w-4 h-4 rounded-full absolute -bottom-1 -right-1 ring-2 ring-background"
                      />
                    </div>
                    <div className="flex flex-col flex-1 text-left">
                      <span className="font-medium leading-tight">
                        {c.token.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground leading-tight">
                        {c.chainName}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span
                        className={`font-mono text-sm leading-tight ${
                          c.balance === 0 ? 'text-muted-foreground' : ''
                        }`}
                      >
                        {formatBalance(c.balance, 4)}
                      </span>
                      <span className="text-xs text-muted-foreground leading-tight">
                        {formatUsd(c.valueUsd)}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Down arrow connector */}
      <div className="flex justify-center -my-1.5 relative z-10">
        <div className="bg-background border border-border/60 rounded-full p-1.5">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Est. Receive */}
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-muted-foreground shrink-0">To</span>
            {recipient === 'smartAccount' && isCalculatingAddress ? (
              <span className="text-muted-foreground">—</span>
            ) : resolvedReceiver ? (
              <span className="flex items-center gap-1 min-w-0 truncate">
                <EnsAvatar address={resolvedReceiver} width={14} height={14} />
                <AddressDisplay address={resolvedReceiver} compact />
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          {smartAccountAddress && eoaAddress && (
            <div className="flex shrink-0 rounded-md border border-border/60 bg-background/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setRecipient('smartAccount')}
                disabled={inputsLocked}
                className={`px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
                  recipient === 'smartAccount'
                    ? 'bg-ethena/20 text-ethena'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sapience Account
              </button>
              <button
                type="button"
                onClick={() => setRecipient('eoa')}
                disabled={inputsLocked}
                className={`px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
                  recipient === 'eoa'
                    ? 'bg-ethena/20 text-ethena'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Wallet
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 min-w-0">
          <span className="text-3xl font-mono text-brand-white truncate">
            {outputAmount != null ? formatBalance(outputAmount, 4) : '0.00'}
          </span>
          <div className="flex items-center gap-2 bg-background/60 rounded-md pl-1.5 pr-2.5 py-1.5 border border-border/60 shrink-0">
            <div className="relative">
              <img src="/usde.svg" alt="" className="w-7 h-7" />
              <img
                src="/ethereal-logomark.svg"
                alt=""
                className="w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full bg-background ring-2 ring-background"
              />
            </div>
            <span className="font-medium text-sm">{collateralSymbol}</span>
          </div>
        </div>
      </div>

      {/* Transaction Breakdown */}
      <details className="rounded-lg border border-border/50 group">
        <summary className="cursor-pointer flex justify-between items-center px-4 py-3 text-sm hover:bg-muted/10 list-none">
          <span>Transaction Breakdown</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
        </summary>
        <div className="px-4 pb-3 space-y-1.5 text-sm">
          {deposit ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Min received</span>
                <span className="font-mono">
                  {formatBalance(minOut ?? 0, 4)} {collateralSymbol}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Bridge fee</span>
                <span>{feePct?.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated time</span>
                <span>~{eta}s</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enter an amount to see route details.
            </p>
          )}
        </div>
      </details>

      {/* Errors */}
      {noRouteAvailable && (
        <p className="text-xs text-amber-500 px-1">
          No bridge route available for this amount.
        </p>
      )}
      {quoteError && !deposit && (
        <p className="text-xs text-amber-500 px-1">
          Could not fetch a quote. Check your connection and try again.
        </p>
      )}
      {errorMsg && <p className="text-xs text-red-400 px-1">{errorMsg}</p>}

      <Button
        onClick={handleBridge}
        disabled={buttonDisabled}
        className="h-12 w-full text-base"
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

function renderTokenChipInner(
  iconUrl: string,
  chainIconUrl: string,
  symbol: string
) {
  return (
    <div className="flex items-center gap-2 text-left">
      <div className="relative">
        <img src={iconUrl} alt="" className="w-7 h-7 rounded-full" />
        <img
          src={chainIconUrl}
          alt=""
          className="w-4 h-4 rounded-full absolute -bottom-1 -right-1 ring-2 ring-background"
        />
      </div>
      <span className="font-medium text-sm">{symbol}</span>
    </div>
  );
}

// Per-source-chain explorer for the deposit tx Bungee returns in status.
const SOURCE_EXPLORER_TX_BASE: Record<number, string> = {
  1: 'https://etherscan.io/tx/',
  42161: 'https://arbiscan.io/tx/',
  8453: 'https://basescan.org/tx/',
  56: 'https://bscscan.com/tx/',
  999: 'https://www.hyperscan.com/tx/',
};

function relativeTime(submittedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function BridgeRow({ record }: { record: BridgeRecord }) {
  const { removeBridge } = useBridgeTracker();
  const { data } = useQuery({
    queryKey: ['bungee-status', record.requestHash],
    queryFn: ({ signal }) => fetchBungeeStatus(record.requestHash, signal),
    refetchInterval: (q) => {
      const last = (
        q.state.data as { result?: BungeeStatusEntry[] } | undefined
      )?.result?.[0];
      return last && isBungeeTerminal(last.bungeeStatusCode)
        ? false
        : STATUS_POLL_MS;
    },
    retry: 1,
  });
  const entry = data?.result?.[0];
  const code = entry?.bungeeStatusCode;
  const terminal = isBungeeTerminal(code);
  const success = isBungeeSuccess(code);

  const recipientLabel =
    record.recipient === 'smartAccount'
      ? 'Sapience Account'
      : 'Ethereal Account';

  // Choose colour for the status pill based on lifecycle state.
  let pillClass = 'border-ethena/40 bg-ethena/10 text-ethena';
  if (terminal && success) {
    pillClass = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
  } else if (terminal && !success) {
    pillClass = 'border-red-500/40 bg-red-500/10 text-red-400';
  }

  const originTxHash = entry?.originData?.txHash;
  const originChainId = entry?.originData?.chainId;
  const explorerBase =
    originChainId !== undefined
      ? SOURCE_EXPLORER_TX_BASE[originChainId]
      : undefined;
  const explorerUrl =
    originTxHash && explorerBase ? `${explorerBase}${originTxHash}` : undefined;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 flex items-center gap-3 text-sm">
      {!terminal ? (
        <Loader2 className="h-4 w-4 animate-spin text-ethena shrink-0" />
      ) : (
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            success ? 'bg-emerald-400' : 'bg-red-400'
          }`}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">→ {recipientLabel}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${pillClass}`}>
            {describeBungeeStatus(code)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{relativeTime(record.submittedAt)}</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              View tx
            </a>
          )}
        </div>
      </div>
      {terminal && (
        <button
          type="button"
          onClick={() => removeBridge(record.requestHash)}
          className="text-muted-foreground hover:text-foreground text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
