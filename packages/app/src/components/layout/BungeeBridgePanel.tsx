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
  BUNGEE_SOURCE_CHAINS,
  describeBungeeStatus,
  fetchBungeeQuote,
  fetchBungeeStatus,
  isBungeeSuccess,
  isBungeeTerminal,
  type BungeeDeposit,
  type BungeeSourceToken,
} from '~/lib/bungee';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';

interface BungeeBridgePanelProps {
  eoaAddress?: Address;
  smartAccountAddress?: Address;
  collateralSymbol?: string;
  isCalculatingAddress?: boolean;
  /** Called once Bungee reports the destination delivery is fulfilled. */
  onDelivered?: () => void;
}

const QUOTE_REFRESH_MS = 30_000;
const STATUS_POLL_MS = 5_000;
const ETH_PRICE_REFRESH_MS = 60_000;

interface SourceCombo {
  key: string;
  chainId: number;
  chainName: string;
  chainIconUrl: string;
  token: BungeeSourceToken;
}

const ALL_COMBOS: SourceCombo[] = BUNGEE_SOURCE_CHAINS.flatMap((c) =>
  c.tokens.map((t) => ({
    key: `${c.chainId}:${t.symbol}`,
    chainId: c.chainId,
    chainName: c.name,
    chainIconUrl: c.iconUrl,
    token: t,
  }))
);

const STABLE_PRICE_USD: Record<string, number> = {
  USDe: 1,
  USDC: 1,
  USDT: 1,
  DAI: 1,
};

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

async function fetchEthUsd(signal?: AbortSignal): Promise<number> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    { signal }
  );
  if (!res.ok) return 0;
  const json = (await res.json()) as { ethereum?: { usd?: number } };
  return Number(json.ethereum?.usd ?? 0);
}

export default function BungeeBridgePanel({
  eoaAddress,
  smartAccountAddress,
  collateralSymbol = 'USDe',
  isCalculatingAddress,
  onDelivered,
}: BungeeBridgePanelProps) {
  const { chain: activeChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [selectedKey, setSelectedKey] = useState<string>(ALL_COMBOS[0].key);
  const [amount, setAmount] = useState('');
  const [requestHash, setRequestHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const selectedCombo: SourceCombo =
    ALL_COMBOS.find((c) => c.key === selectedKey) ?? ALL_COMBOS[0];
  const sourceChainId = selectedCombo.chainId;
  const sourceToken = selectedCombo.token;

  const inputAmountWei = useMemo(() => {
    if (!amount) return null;
    try {
      const parsed = parseUnits(amount, sourceToken.decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount, sourceToken.decimals]);

  // Batch ERC20 balances across all chains in one wagmi multicall set.
  const erc20Combos = useMemo(
    () => ALL_COMBOS.filter((c) => !c.token.isNative),
    []
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
  // hooks consistent across renders.
  const nativeBalArbitrum = useBalance({
    chainId: 42161,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalMainnet = useBalance({
    chainId: 1,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const nativeBalanceByChainId: Record<number, bigint> = {
    42161: nativeBalArbitrum.data?.value ?? 0n,
    1: nativeBalMainnet.data?.value ?? 0n,
  };

  const { data: ethPriceUsd } = useQuery({
    queryKey: ['eth-usd-price'],
    queryFn: ({ signal }) => fetchEthUsd(signal),
    staleTime: ETH_PRICE_REFRESH_MS,
    refetchInterval: ETH_PRICE_REFRESH_MS,
    enabled: ALL_COMBOS.some((c) => c.token.symbol === 'ETH'),
  });

  const combosWithBalance = useMemo(() => {
    return ALL_COMBOS.map((c) => {
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
        (c.token.symbol === 'ETH' ? (ethPriceUsd ?? 0) : 0);
      return { ...c, raw, balance, valueUsd: balance * priceUsd };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    erc20Combos,
    erc20BalancesData,
    nativeBalArbitrum.data?.value,
    nativeBalMainnet.data?.value,
    ethPriceUsd,
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
  const sourceBalanceNum = selectedComboData?.balance ?? 0;

  // On first balance load, auto-pick the highest-balance combo so users don't
  // have to hunt for their funds. Only fires once.
  const initialAutoSelectDone = useRef(false);
  useEffect(() => {
    if (initialAutoSelectDone.current) return;
    if (!eoaAddress) return;
    if (!erc20BalancesData) return;
    if (nativeBalArbitrum.isLoading || nativeBalMainnet.isLoading) return;
    const top = sortedCombos[0];
    if (top && top.valueUsd > 0) setSelectedKey(top.key);
    initialAutoSelectDone.current = true;
  }, [
    eoaAddress,
    erc20BalancesData,
    nativeBalArbitrum.isLoading,
    nativeBalMainnet.isLoading,
    sortedCombos,
  ]);

  // Auto-fill amount with the EOA's full source balance once per combo.
  // Doesn't overwrite later balance refetches so the user can still type freely.
  const lastAutoFillKey = useRef<string>('');
  useEffect(() => {
    const key = `${selectedKey}|${eoaAddress ?? ''}`;
    if (lastAutoFillKey.current === key) return;
    const balanceLoaded = sourceToken.isNative
      ? !nativeBalArbitrum.isLoading && !nativeBalMainnet.isLoading
      : erc20BalancesData !== undefined;
    if (!balanceLoaded) return;
    setAmount(
      sourceBalance > 0n
        ? formatAmountForInput(sourceBalance, sourceToken.decimals)
        : ''
    );
    lastAutoFillKey.current = key;
  }, [
    selectedKey,
    eoaAddress,
    sourceToken.isNative,
    sourceToken.decimals,
    sourceBalance,
    erc20BalancesData,
    nativeBalArbitrum.isLoading,
    nativeBalMainnet.isLoading,
  ]);

  const isInFlight = !!requestHash;

  const quoteEnabled =
    !!eoaAddress &&
    !!smartAccountAddress &&
    !!inputAmountWei &&
    inputAmountWei > 0n &&
    !isInFlight;

  const {
    data: quote,
    isFetching: isQuoting,
    error: quoteError,
    refetch: refetchQuote,
  } = useQuery({
    queryKey: [
      'bungee-quote',
      sourceChainId,
      sourceToken.address,
      inputAmountWei?.toString(),
      eoaAddress,
      smartAccountAddress,
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
          receiverAddress: smartAccountAddress!,
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

  const { data: statusData } = useQuery({
    queryKey: ['bungee-status', requestHash],
    queryFn: ({ signal }) => fetchBungeeStatus(requestHash!, signal),
    enabled: !!requestHash,
    refetchInterval: (q) => {
      const last = q.state.data?.result?.[0];
      if (last && isBungeeTerminal(last.bungeeStatusCode)) return false;
      return STATUS_POLL_MS;
    },
  });
  const statusEntry = statusData?.result?.[0];
  const statusCode = statusEntry?.bungeeStatusCode;
  const isComplete = isBungeeSuccess(statusCode);
  const isFailed = isBungeeTerminal(statusCode) && !isBungeeSuccess(statusCode);

  useEffect(() => {
    if (isComplete && onDelivered) onDelivered();
  }, [isComplete, onDelivered]);

  // Refresh the quote as soon as it expires, so the Bridge button never sits
  // wired to stale txData.
  useEffect(() => {
    if (!isQuoteExpired) return;
    if (isQuoting || isInFlight || isSending) return;
    refetchQuote();
  }, [isQuoteExpired, isQuoting, isInFlight, isSending, refetchQuote]);

  const handleBridge = async () => {
    if (!deposit || !eoaAddress) return;
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
      setRequestHash(deposit.requestHash);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setErrorMsg(err.shortMessage || err.message || 'Transaction failed');
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setRequestHash(null);
    setErrorMsg(null);
    setAmount('');
  };

  const insufficientFunds = !!inputAmountWei && inputAmountWei > sourceBalance;

  const outputAmount = deposit
    ? Number(formatUnits(BigInt(deposit.output.amount), 18))
    : null;
  const minOut = deposit
    ? Number(formatUnits(BigInt(deposit.output.minAmountOut), 18))
    : null;
  const feePct = deposit ? Number(deposit.totalFeeBps) / 100 : null;
  const eta = deposit?.estimatedTime;

  const inputsLocked = isInFlight && !isComplete && !isFailed;

  const buttonLabel = (() => {
    if (isComplete) return 'Bridge again';
    if (isFailed) return 'Try again';
    if (isSending) return 'Confirm in wallet…';
    if (isInFlight) return `${describeBungeeStatus(statusCode)}…`;
    if (isQuoting && !deposit) return 'Getting quote…';
    if (insufficientFunds) return 'Insufficient balance';
    if (!inputAmountWei) return 'Enter an amount';
    if (!deposit) return 'No route available';
    if (isQuoteExpired)
      return isQuoting ? 'Refreshing quote…' : 'Quote expired';
    return `Bridge to Sapience Account`;
  })();

  const buttonDisabled =
    !isComplete &&
    !isFailed &&
    (isSending ||
      isInFlight ||
      !deposit ||
      insufficientFunds ||
      !inputAmountWei ||
      isQuoteExpired);

  const buttonOnClick = isComplete || isFailed ? handleReset : handleBridge;

  const setAmountFraction = (fraction: number) => {
    if (sourceBalance === 0n) return;
    const value =
      fraction === 1
        ? sourceBalance
        : (sourceBalance * BigInt(Math.floor(fraction * 10_000))) / 10_000n;
    setAmount(formatAmountForInput(value, sourceToken.decimals));
  };

  return (
    <div className="space-y-3 min-w-0">
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
              disabled={inputsLocked || sourceBalance === 0n}
              className="px-2 py-0.5 text-xs bg-muted/60 hover:bg-muted rounded disabled:opacity-50"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => setAmountFraction(1)}
              disabled={inputsLocked || sourceBalance === 0n}
              className="px-2 py-0.5 text-xs bg-muted/60 hover:bg-muted rounded disabled:opacity-50"
            >
              Max:{' '}
              {formatBalance(sourceBalanceNum, sourceToken.isNative ? 4 : 2)}
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
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-muted-foreground shrink-0">To</span>
          {isCalculatingAddress ? (
            <span className="text-muted-foreground">—</span>
          ) : smartAccountAddress ? (
            <span className="flex items-center gap-1 min-w-0 truncate">
              <EnsAvatar address={smartAccountAddress} width={14} height={14} />
              <AddressDisplay address={smartAccountAddress} compact />
              <span className="text-muted-foreground">(Sapience Account)</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
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

      {/* Status / errors */}
      {isInFlight && !isComplete && !isFailed && (
        <div className="flex items-center gap-2 rounded-lg border border-ethena/40 bg-ethena/10 p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-ethena" />
          <span>Bridging — {describeBungeeStatus(statusCode)}</span>
        </div>
      )}
      {isComplete && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          Funds delivered to your Sapience Account.
        </p>
      )}
      {isFailed && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          Bridge {describeBungeeStatus(statusCode).toLowerCase()}.{' '}
          {statusEntry?.refund?.txHash
            ? 'Refund processed to your wallet.'
            : 'Funds were not delivered.'}
        </p>
      )}
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
        onClick={buttonOnClick}
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
