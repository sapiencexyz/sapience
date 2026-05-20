import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
} from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import {
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
} from 'viem';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import {
  BUNGEE_NATIVE_TOKEN,
  BUNGEE_SOURCE_CHAIN_META,
  BUNGEE_TOKEN_COINGECKO_IDS,
  fetchBungeeQuote,
  fetchBungeeTokens,
  QUOTE_REFRESH_MS,
  selectBungeeSourceTokens,
  STABLE_PRICE_USD,
  type BungeeDeposit,
  type BungeeSourceToken,
} from '~/lib/bungee';
import { useBungeeNativeBalances } from '~/hooks/blockchain/useBungeeNativeBalances';
import { formatBalance, formatTokenInput, formatUsd } from '~/lib/format/balance';

const NATIVE_PRICE_REFRESH_MS = 60_000;
const TOKEN_LIST_REFRESH_MS = 10 * 60_000;
const DEST_CHAIN_ID = CHAIN_ID_ETHEREAL;

interface SourceCombo {
  key: string;
  chainId: number;
  chainName: string;
  chainIconUrl: string;
  token: BungeeSourceToken;
}

const SOURCE_CHAIN_IDS = BUNGEE_SOURCE_CHAIN_META.map((c) => c.chainId);

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

async function fetchNativeUsdPrices(
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const ids = Object.values(BUNGEE_TOKEN_COINGECKO_IDS);
  if (ids.length === 0) return {};
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
    { signal },
  );
  if (!res.ok) return {};
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [symbol, id] of Object.entries(BUNGEE_TOKEN_COINGECKO_IDS)) {
    out[symbol] = Number(json[id]?.usd ?? 0);
  }
  return out;
}

interface Props {
  eoaAddress: Address;
  /**
   * Where the bridged funds should land. Defaults to the EOA, but in the
   * bingo flow this is the Sapience smart account address.
   */
  receiverAddress?: Address;
  /** Wei amount the user needs to bridge to clear the checkout gate. */
  prefillAmountWei?: bigint;
  /** Called after the bridge tx is confirmed in the wallet. */
  onBridged?: () => void;
}

export default function BungeeBridge({
  eoaAddress,
  receiverAddress,
  prefillAmountWei,
  onBridged,
}: Props) {
  const resolvedReceiver = receiverAddress ?? eoaAddress;
  const { chain: activeChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // 1) Token list (per chain) ----------------------------------------------
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

  // Default selection
  useEffect(() => {
    if (selectedKey) return;
    if (allCombos.length === 0) return;
    setSelectedKey(allCombos[0].key);
  }, [selectedKey, allCombos]);

  const selectedCombo: SourceCombo | undefined =
    allCombos.find((c) => c.key === selectedKey) ?? allCombos[0];
  const sourceChainId = selectedCombo?.chainId;
  const sourceToken = selectedCombo?.token;

  // 2) Balances ------------------------------------------------------------
  const erc20Combos = useMemo(
    () => allCombos.filter((c) => !c.token.isNative),
    [allCombos],
  );
  const { data: erc20BalancesData } = useReadContracts({
    contracts: erc20Combos.map((c) => ({
      chainId: c.chainId,
      address: c.token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [eoaAddress],
    })),
    query: { enabled: erc20Combos.length > 0 },
  });

  const {
    byChainId: nativeBalanceByChainId,
    isLoading: nativeBalancesLoading,
  } = useBungeeNativeBalances(eoaAddress);

  const { data: nativePricesUsd } = useQuery({
    queryKey: ['bungee-native-prices'],
    queryFn: ({ signal }) => fetchNativeUsdPrices(signal),
    staleTime: NATIVE_PRICE_REFRESH_MS,
    refetchInterval: NATIVE_PRICE_REFRESH_MS,
    enabled: allCombos.some(
      (c) => BUNGEE_TOKEN_COINGECKO_IDS[c.token.symbol] !== undefined,
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
  }, [
    allCombos,
    erc20Combos,
    erc20BalancesData,
    nativeBalanceByChainId,
    nativePricesUsd,
  ]);

  const sortedCombos = useMemo(
    () =>
      [...combosWithBalance].sort((a, b) => {
        if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
        return b.balance - a.balance;
      }),
    [combosWithBalance],
  );

  const visibleCombos = useMemo(() => {
    const nonZero = sortedCombos.filter(
      (c) => c.balance > 0 || c.key === selectedKey,
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
    ? sourceBalance > nativeGasReserveWei
      ? sourceBalance - nativeGasReserveWei
      : 0n
    : sourceBalance;

  // Auto-select largest combo once balances arrive
  const initialAutoSelectDone = useRef(false);
  useEffect(() => {
    if (initialAutoSelectDone.current) return;
    if (allCombos.length === 0) return;
    if (!erc20BalancesData) return;
    if (nativeBalancesLoading) return;
    const top = sortedCombos[0];
    if (top && top.valueUsd > 0) setSelectedKey(top.key);
    initialAutoSelectDone.current = true;
  }, [
    allCombos.length,
    erc20BalancesData,
    nativeBalancesLoading,
    sortedCombos,
  ]);

  // Auto-fill amount: prefer caller-provided deficit, else max spendable
  const lastAutoFillKey = useRef<string>('');
  useEffect(() => {
    if (!sourceToken) return;
    const key = `${selectedKey}|${eoaAddress}`;
    if (lastAutoFillKey.current === key) return;
    const balanceLoaded = sourceToken.isNative
      ? !nativeBalancesLoading
      : erc20BalancesData !== undefined;
    if (!balanceLoaded) return;

    // For stables (USDC/USDT/USDe) prefer prefill (we want roughly the dollar
    // deficit). For non-stables, default to max so the user funds whatever
    // they can rather than seeing a confusing prefilled crypto-quantity.
    const prefillIsUsable =
      prefillAmountWei &&
      STABLE_PRICE_USD[sourceToken.symbol] !== undefined &&
      prefillAmountWei <= maxSpendableSourceBalance;

    if (prefillIsUsable) {
      setAmount(formatTokenInput(prefillAmountWei, sourceToken.decimals));
    } else if (maxSpendableSourceBalance > 0n) {
      setAmount(formatTokenInput(maxSpendableSourceBalance, sourceToken.decimals));
    } else {
      setAmount('');
    }
    lastAutoFillKey.current = key;
  }, [
    selectedKey,
    eoaAddress,
    sourceToken,
    maxSpendableSourceBalance,
    erc20BalancesData,
    nativeBalancesLoading,
    prefillAmountWei,
  ]);

  const inputAmountWei = useMemo(() => {
    if (!amount || !sourceToken) return null;
    try {
      const parsed = parseUnits(amount, sourceToken.decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount, sourceToken]);

  // 3) Quote ---------------------------------------------------------------
  const quoteEnabled =
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
          originChainId: sourceChainId!,
          destinationChainId: DEST_CHAIN_ID,
          inputToken: sourceToken!.address,
          outputToken: BUNGEE_NATIVE_TOKEN,
          inputAmount: inputAmountWei!.toString(),
          userAddress: eoaAddress,
          receiverAddress: resolvedReceiver,
          refundAddress: eoaAddress,
        },
        signal,
      ),
    enabled: quoteEnabled,
    staleTime: 15_000,
    refetchInterval: quoteEnabled ? QUOTE_REFRESH_MS : false,
    retry: 1,
  });

  const deposit: BungeeDeposit | undefined = quote?.result?.deposit;
  const noRouteAvailable =
    !!quote && !deposit && !!inputAmountWei && !isQuoting;

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!deposit?.expiry) return;
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [deposit?.expiry]);
  const isQuoteExpired = !!deposit?.expiry && deposit.expiry <= nowSec;

  useEffect(() => {
    if (!isQuoteExpired) return;
    if (isQuoting || isSending) return;
    refetchQuote();
  }, [isQuoteExpired, isQuoting, isSending, refetchQuote]);

  // 4) Send ----------------------------------------------------------------
  const handleBridge = async () => {
    if (!deposit || sourceChainId === undefined) return;
    if (deposit.expiry > 0 && deposit.expiry <= Math.floor(Date.now() / 1000)) {
      refetchQuote();
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
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
      setStatusMsg(
        `Bridge submitted. ~${deposit.estimatedTime}s until funds land on Ethereal.`,
      );
      setAmount('');
      onBridged?.();
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
  const feePct = deposit ? Number(deposit.totalFeeBps) / 100 : null;
  const eta = deposit?.estimatedTime;

  const inputsLocked = isSending;

  const buttonLabel = (() => {
    if (isSending) return 'Confirm in wallet…';
    if (insufficientFunds) return insufficientFundsLabel;
    if (!inputAmountWei) return 'Enter an amount';
    if (isQuoting && !deposit) return 'Getting quote…';
    if (!deposit) return 'No route available';
    if (isQuoteExpired) return isQuoting ? 'Refreshing quote…' : 'Quote expired';
    return 'Bridge to Ethereal';
  })();

  const buttonDisabled =
    isSending ||
    insufficientFunds ||
    !inputAmountWei ||
    !deposit ||
    isQuoteExpired;

  const setAmountFraction = (fraction: number) => {
    if (!sourceToken || maxSpendableSourceBalance === 0n) return;
    const value =
      fraction === 1
        ? maxSpendableSourceBalance
        : (maxSpendableSourceBalance * BigInt(Math.floor(fraction * 10_000))) /
          10_000n;
    setAmount(formatTokenInput(value, sourceToken.decimals));
  };

  if (allCombos.length === 0) {
    return (
      <div className="bungee-panel">
        <div className="bungee-panel-loading">Loading routes…</div>
      </div>
    );
  }

  return (
    <div className="bungee-panel">
      {/* Amount + source picker */}
      <div className="bungee-amount-card">
        <div className="bungee-row">
          <span className="bungee-label">From</span>
          <div className="bungee-max-buttons">
            <button
              type="button"
              onClick={() => setAmountFraction(0.5)}
              disabled={inputsLocked || maxSpendableSourceBalance === 0n}
              className="bungee-frac"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => setAmountFraction(1)}
              disabled={inputsLocked || maxSpendableSourceBalance === 0n}
              className="bungee-frac"
            >
              Max
            </button>
          </div>
        </div>
        <div className="bungee-amount-row">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={inputsLocked}
            className="bungee-amount-input"
          />
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            disabled={inputsLocked}
            className="bungee-token-select"
          >
            {visibleCombos.map((c) => (
              <option key={c.key} value={c.key}>
                {c.token.symbol} · {c.chainName} ·{' '}
                {formatBalance(c.balance, 4)}
                {c.valueUsd > 0 ? ` (${formatUsd(c.valueUsd)})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Down chevron */}
      <div className="bungee-arrow">↓</div>

      {/* Estimated receive */}
      <div className="bungee-receive-card">
        <div className="bungee-row">
          <span className="bungee-label">To Ethereal</span>
          <span className="bungee-label-muted">USDe</span>
        </div>
        <div className="bungee-amount-row">
          <span className="bungee-receive-amount">
            {outputAmount != null ? formatBalance(outputAmount, 4) : '0.00'}
          </span>
        </div>
      </div>

      {/* Breakdown */}
      {deposit && (
        <div className="bungee-breakdown">
          <div className="bungee-breakdown-row">
            <span>Bridge fee</span>
            <span>{feePct?.toFixed(2)}%</span>
          </div>
          <div className="bungee-breakdown-row">
            <span>ETA</span>
            <span>~{eta}s</span>
          </div>
        </div>
      )}

      {noRouteAvailable && (
        <p className="bungee-warning">
          No bridge route for this amount. Try a larger amount.
        </p>
      )}
      {quoteError && !deposit && (
        <p className="bungee-warning">
          Couldn't fetch a quote. Check your connection and retry.
        </p>
      )}
      {errorMsg && <p className="bungee-error">{errorMsg}</p>}
      {statusMsg && <p className="bungee-status">{statusMsg}</p>}

      <button
        type="button"
        onClick={handleBridge}
        disabled={buttonDisabled}
        className="primary block"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
