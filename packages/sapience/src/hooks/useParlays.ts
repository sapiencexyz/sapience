import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { erc20Abi, formatUnits } from 'viem';
import type { Abi } from 'abitype';
import ParlayPool from '@/protocol/deployments/ParlayPool.json';
import { usePublicClient, useReadContracts } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';

// TODO: centralize these in a shared constants module if needed
export const PARLAY_CONTRACT_ADDRESS =
  '0x918e72DAB2aF7672AbF534F744770D7F8859C55e' as Address;

// Use ABI from deployments directly (now includes all required functions)
const PARLAY_ABI: Abi = (ParlayPool as { abi: Abi }).abi;

// Fallback ABI variant: handles case where `prediction` is encoded as uint8 on-chain
const PARLAY_ABI_ALT: Abi = [
  {
    type: 'function',
    name: 'getParlayOrder',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      {
        name: 'parlayData',
        type: 'tuple',
        components: [
          { name: 'maker', type: 'address' },
          { name: 'orderExpirationTime', type: 'uint256' },
          { name: 'filled', type: 'bool' },
          { name: 'taker', type: 'address' },
          { name: 'makerNftTokenId', type: 'uint256' },
          { name: 'takerNftTokenId', type: 'uint256' },
          { name: 'collateral', type: 'uint256' },
          { name: 'payout', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'settled', type: 'bool' },
          { name: 'makerWon', type: 'bool' },
        ],
      },
      {
        name: 'predictedOutcomes',
        type: 'tuple[]',
        components: [
          {
            name: 'market',
            type: 'tuple',
            components: [
              { name: 'marketGroup', type: 'address' },
              { name: 'marketId', type: 'uint256' },
            ],
          },
          { name: 'prediction', type: 'uint8' },
        ],
      },
    ],
  },
];

export type ParlayMarket = {
  marketGroup: Address;
  marketId: bigint;
};

export type ParlayPredictedOutcome = {
  market: ParlayMarket;
  prediction: boolean;
};

export type ParlayData = {
  id: bigint;
  maker: Address;
  taker: Address;
  orderExpirationTime: bigint;
  filled: boolean;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  collateral: bigint;
  payout: bigint;
  createdAt: bigint;
  settled: boolean;
  makerWon: boolean;
  predictedOutcomes: ParlayPredictedOutcome[];
};

type UseParlaysOptions = { chainId?: number; account?: Address };

export function useParlays(options: UseParlaysOptions = {}) {
  // Always default to Arbitrum (42161) for reads unless explicitly overridden
  const activeChainId = options.chainId ?? 42161;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { toast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [probedIds, setProbedIds] = useState<bigint[]>([]);
  const [probeCursor, setProbeCursor] = useState<bigint>(1n);
  const [doneProbing, setDoneProbing] = useState<boolean>(false);
  const [rateLimitNotified, setRateLimitNotified] = useState<boolean>(false);

  const maybeToast429 = useCallback(
    (err: unknown) => {
      if (rateLimitNotified) return;
      const message =
        (err instanceof Error ? err.message : String(err ?? '')) || '';
      const lower = message.toLowerCase();
      if (
        lower.includes('429') ||
        lower.includes('too many requests') ||
        lower.includes('rate limit')
      ) {
        toast({
          title: 'Rate limited',
          description:
            'We are being rate limited by the RPC provider. Please try again in a few seconds.',
          variant: 'destructive',
          duration: 5000,
        });
        setRateLimitNotified(true);
      }
    },
    [toast, rateLimitNotified]
  );

  // Probe for existing request IDs using read-only calls in ascending chunks
  useEffect(() => {
    let cancelled = false;
    if (!publicClient || doneProbing) return;

    async function probeChunk(
      client: NonNullable<typeof publicClient>,
      start: bigint,
      chunkSize = 25n
    ) {
      setLoading(true);
      setError(null);
      const end = start + chunkSize - 1n;
      try {
        const calls = [] as Array<
          Parameters<(typeof client)['readContract']>[0]
        >;
        for (let id = start; id <= end; id++) {
          calls.push({
            address: PARLAY_CONTRACT_ADDRESS,
            abi: PARLAY_ABI,
            functionName: 'getParlayOrder',
            args: [id],
          });
        }
        const results = await Promise.all(
          calls.map((c) => client.readContract(c))
        );

        const found: bigint[] = [];
        let hitEmptyTail = false;
        results.forEach((res, idx) => {
          try {
            const [parlayData] = res as [
              {
                maker: string;
              },
            ];
            const requestId = start + BigInt(idx);
            // Heuristic: exists if maker != 0x0
            if (
              parlayData &&
              parlayData.maker &&
              parlayData.maker !== '0x0000000000000000000000000000000000000000'
            ) {
              found.push(requestId);
            } else {
              hitEmptyTail = true;
            }
          } catch {
            hitEmptyTail = true;
          }
        });

        if (!cancelled) {
          setProbedIds((prev) => {
            const merged = new Set(prev.concat(found));
            return Array.from(merged).sort((a, b) => (a > b ? -1 : 1));
          });
          if (hitEmptyTail) {
            setDoneProbing(true);
          } else {
            setProbeCursor(end + 1n);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to read parlays');
          maybeToast429(e);
          setDoneProbing(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Kick a chunk probe
    void probeChunk(publicClient, probeCursor);
    return () => {
      cancelled = true;
    };
  }, [publicClient, probeCursor, doneProbing]);

  // Read unfilled order ids
  const unfilledRead = useReadContracts({
    contracts: [
      {
        address: PARLAY_CONTRACT_ADDRESS,
        abi: PARLAY_ABI,
        functionName: 'getUnfilledOrderIds',
        chainId: activeChainId,
      },
    ],
    query: { enabled: !!publicClient },
  });

  const unfilledIds: bigint[] = useMemo(() => {
    const item = unfilledRead.data?.[0];
    if (item && item.status === 'success') {
      const arr = item.result as bigint[];
      return Array.isArray(arr) ? arr : [];
    }
    return [];
  }, [unfilledRead.data]);

  // Read order IDs for the provided account (maker or taker)
  const myIdsRead = useReadContracts({
    contracts: options.account
      ? [
          {
            address: PARLAY_CONTRACT_ADDRESS,
            abi: PARLAY_ABI,
            functionName: 'getOrderIdsByAddress',
            args: [options.account],
            chainId: activeChainId,
          },
        ]
      : [],
    query: { enabled: !!publicClient && !!options.account },
  });

  const myIds: bigint[] = useMemo(() => {
    const item = myIdsRead.data?.[0];
    if (item && item.status === 'success') {
      const arr = item.result as bigint[];
      return Array.isArray(arr) ? arr : [];
    }
    return [];
  }, [myIdsRead.data]);

  // Multicall target ids: union of unfilled and myIds; fallback to probed if empty
  const ids: bigint[] = useMemo(() => {
    const union = Array.from(new Set([...unfilledIds, ...myIds]));
    return union.length > 0 ? union : probedIds;
  }, [unfilledIds, myIds, probedIds]);

  // Read config to discover collateral token for decimals
  const configRead = useReadContracts({
    contracts: [
      {
        address: PARLAY_CONTRACT_ADDRESS,
        abi: PARLAY_ABI,
        functionName: 'getConfig',
        chainId: activeChainId,
      },
    ],
    query: { enabled: !!publicClient },
  });

  const collateralToken = ((): Address | undefined => {
    const item = configRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as {
        collateralToken: Address;
      };
      return cfg.collateralToken;
    }
    return undefined;
  })();

  const decimalsRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: activeChainId,
          },
        ]
      : [],
    query: { enabled: !!collateralToken },
  });

  const tokenDecimals = useMemo(() => {
    const item = decimalsRead.data?.[0];
    if (item && item.status === 'success') {
      return Number(item.result as unknown as bigint);
    }
    return 18; // sensible default
  }, [decimalsRead.data]);

  // Batch read each parlay order by id
  const ordersRead = useReadContracts({
    contracts: ids.map((id) => ({
      address: PARLAY_CONTRACT_ADDRESS,
      abi: PARLAY_ABI,
      functionName: 'getParlayOrder',
      args: [id],
      chainId: activeChainId,
    })),
    query: { enabled: ids.length > 0 && !!publicClient },
  });

  // Alt decoding path (prediction as uint8)
  const ordersReadAlt = useReadContracts({
    contracts: ids.map((id) => ({
      address: PARLAY_CONTRACT_ADDRESS,
      abi: PARLAY_ABI_ALT,
      functionName: 'getParlayOrder',
      args: [id],
      chainId: activeChainId,
    })),
    query: { enabled: ids.length > 0 && !!publicClient },
  });

  // Surface 429/rate-limit errors via toast (once)
  useEffect(() => {
    if (unfilledRead.error) maybeToast429(unfilledRead.error);
    if (myIdsRead.error) maybeToast429(myIdsRead.error);
    if (configRead.error) maybeToast429(configRead.error);
    if (decimalsRead.error) maybeToast429(decimalsRead.error);
    if (ordersRead.error) maybeToast429(ordersRead.error);
    if (ordersReadAlt.error) maybeToast429(ordersReadAlt.error);
  }, [
    unfilledRead.error,
    myIdsRead.error,
    configRead.error,
    decimalsRead.error,
    ordersRead.error,
    ordersReadAlt.error,
    maybeToast429,
  ]);

  const parlays: ParlayData[] = useMemo(() => {
    const original = ordersRead.data ?? [];
    const alt = ordersReadAlt.data ?? [];
    if (original.length === 0 && alt.length === 0) return [];

    return ids
      .map((id, idx) => {
        const primary = original[idx];
        const fallback = alt[idx];
        let chosen: typeof primary | undefined;
        if (primary && primary.status === 'success') chosen = primary;
        else if (fallback && fallback.status === 'success') chosen = fallback;
        else return undefined;

        const [parlayData, rawOutcomes] = (chosen as any).result as [
          {
            maker: Address;
            orderExpirationTime: bigint;
            filled: boolean;
            taker: Address;
            makerNftTokenId: bigint;
            takerNftTokenId: bigint;
            collateral: bigint;
            payout: bigint;
            createdAt: bigint;
            settled: boolean;
            makerWon: boolean;
          },
          Array<
            | ParlayPredictedOutcome
            | {
                market: ParlayMarket;
                prediction: bigint; // alt path
              }
          >,
        ];

        const predictedOutcomes: ParlayPredictedOutcome[] = rawOutcomes.map(
          (o: any) => ({
            market: o.market,
            prediction:
              typeof o.prediction === 'bigint'
                ? Number(o.prediction) !== 0
                : Boolean(o.prediction),
          })
        );

        return {
          id,
          maker: parlayData.maker,
          taker: parlayData.taker,
          orderExpirationTime: parlayData.orderExpirationTime,
          filled: parlayData.filled,
          makerNftTokenId: parlayData.makerNftTokenId,
          takerNftTokenId: parlayData.takerNftTokenId,
          collateral: parlayData.collateral,
          payout: parlayData.payout,
          createdAt: parlayData.createdAt,
          settled: parlayData.settled,
          makerWon: parlayData.makerWon,
          predictedOutcomes,
        } satisfies ParlayData;
      })
      .filter(Boolean) as ParlayData[];
  }, [ordersRead.data, ordersReadAlt.data, ids]);

  const formatted = useMemo(
    () =>
      parlays.map((p) => {
        const collateralFormatted = formatUnits(p.collateral, tokenDecimals);
        const payoutFormatted = formatUnits(p.payout, tokenDecimals);
        // markets count
        const marketsCount = p.predictedOutcomes?.length ?? 0;
        // delta values
        const delta = p.payout > p.collateral ? p.payout - p.collateral : 0n;
        const deltaFormatted = formatUnits(delta, tokenDecimals);
        // odds ratio (payout / collateral)
        let odds: number | undefined;
        let oddsFormatted: string | undefined;
        const collateralNum = Number(collateralFormatted);
        const payoutNum = Number(payoutFormatted);
        if (
          Number.isFinite(collateralNum) &&
          collateralNum > 0 &&
          Number.isFinite(payoutNum)
        ) {
          odds = payoutNum / collateralNum;
          oddsFormatted = `${odds.toFixed(2)}x`;
        }
        return {
          ...p,
          collateralFormatted,
          payoutFormatted,
          marketsCount,
          delta,
          deltaFormatted,
          odds,
          oddsFormatted,
        };
      }),
    [parlays, tokenDecimals]
  );

  const byId = useMemo(() => {
    const map = new Map<string, (typeof formatted)[number]>();
    for (const p of formatted) map.set(p.id.toString(), p);
    return map;
  }, [formatted]);

  return {
    loading:
      loading ||
      ordersRead.isLoading ||
      ordersReadAlt.isLoading ||
      configRead.isLoading ||
      unfilledRead.isLoading ||
      myIdsRead.isLoading,
    error:
      error ||
      ordersRead.error?.message ||
      ordersReadAlt.error?.message ||
      configRead.error?.message ||
      unfilledRead.error?.message ||
      myIdsRead.error?.message ||
      null,
    parlays: formatted,
    byId,
    tokenDecimals,
    collateralToken,
    // Expose raw unfilled IDs for troubleshooting/visibility
    unfilledIds,
    myIds,
    // Debug visibility
    queriedIds: ids,
    rawOrders: ordersRead.data,
    rawOrdersAlt: ordersReadAlt.data,
  };
}
