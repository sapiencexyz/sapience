import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';

// TODO: centralize these in a shared constants module if needed
export const PARLAY_CONTRACT_ADDRESS =
  '0xb2d82FAd2847D839773fa226CB094eb195f88abF' as Address;

// Minimal ABI fragments for the functions/events we use
const MARKET_COMPONENTS = [
  { name: 'marketGroup', type: 'address' as const },
  { name: 'marketId', type: 'uint256' as const },
];

const PREDICTED_OUTCOME_COMPONENTS = [
  { name: 'market', type: 'tuple' as const, components: MARKET_COMPONENTS },
  { name: 'prediction', type: 'bool' as const },
];

const PARLAY_DATA_COMPONENTS = [
  { name: 'maker', type: 'address' as const },
  { name: 'orderExpirationTime', type: 'uint256' as const },
  { name: 'filled', type: 'bool' as const },
  { name: 'taker', type: 'address' as const },
  { name: 'makerNftTokenId', type: 'uint256' as const },
  { name: 'takerNftTokenId', type: 'uint256' as const },
  { name: 'collateral', type: 'uint256' as const },
  { name: 'payout', type: 'uint256' as const },
  { name: 'createdAt', type: 'uint256' as const },
  { name: 'settled', type: 'bool' as const },
  { name: 'makerWon', type: 'bool' as const },
];

const PARLAY_ABI = [
  {
    type: 'function',
    name: 'getConfig',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'collateralToken', type: 'address' },
          { name: 'makerNft', type: 'address' },
          { name: 'takerNft', type: 'address' },
          { name: 'maxParlayMarkets', type: 'uint256' },
          { name: 'minCollateral', type: 'uint256' },
          { name: 'minRequestExpirationTime', type: 'uint256' },
          { name: 'maxRequestExpirationTime', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getParlayOrder',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      { name: 'parlayData', type: 'tuple', components: PARLAY_DATA_COMPONENTS },
      {
        name: 'predictedOutcomes',
        type: 'tuple[]',
        components: PREDICTED_OUTCOME_COMPONENTS,
      },
    ],
  },
  {
    type: 'event',
    name: 'ParlayOrderSubmitted',
    inputs: [
      { name: 'maker', type: 'address', indexed: false },
      { name: 'requestId', type: 'uint256', indexed: false },
      {
        name: 'predictedOutcomes',
        type: 'tuple[]',
        indexed: false,
        components: PREDICTED_OUTCOME_COMPONENTS,
      },
      { name: 'collateral', type: 'uint256', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'orderExpirationTime', type: 'uint256', indexed: false },
    ],
  },
] as const;

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

export function useParlays() {
  const { chainId } = useAccount();
  const publicClient = usePublicClient({ chainId });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ids, setIds] = useState<bigint[]>([]);
  const [probeCursor, setProbeCursor] = useState<bigint>(1n);
  const [doneProbing, setDoneProbing] = useState<boolean>(false);

  // Probe for existing request IDs using read-only calls in ascending chunks
  useEffect(() => {
    let cancelled = false;
    if (!publicClient || doneProbing) return;

    async function probeChunk(start: bigint, chunkSize = 25n) {
      setLoading(true);
      setError(null);
      const end = start + chunkSize - 1n;
      try {
        const calls = [] as Array<
          Parameters<typeof publicClient.readContract>[0]
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
          calls.map((c) => publicClient.readContract(c))
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
          setIds((prev) => {
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
          setDoneProbing(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Kick a chunk probe
    void probeChunk(probeCursor);
    return () => {
      cancelled = true;
    };
  }, [publicClient, probeCursor, doneProbing]);

  // Read config to discover collateral token for decimals
  const configRead = useReadContracts({
    contracts: [
      {
        address: PARLAY_CONTRACT_ADDRESS,
        abi: PARLAY_ABI,
        functionName: 'getConfig',
        chainId,
      },
    ],
    query: { enabled: !!publicClient },
  });

  const collateralToken = ((): Address | undefined => {
    const item = configRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as unknown as {
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
            chainId,
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
      chainId,
    })),
    query: { enabled: ids.length > 0 && !!publicClient },
  });

  const parlays: ParlayData[] = useMemo(() => {
    if (!ordersRead.data) return [];
    return ordersRead.data
      .map((entry, idx) => {
        if (entry.status !== 'success') return undefined;
        const [parlayData, predictedOutcomes] = entry.result as unknown as [
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
          ParlayPredictedOutcome[],
        ];
        return {
          id: ids[idx],
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
  }, [ordersRead.data, ids]);

  const formatted = useMemo(
    () =>
      parlays.map((p) => ({
        ...p,
        collateralFormatted: formatUnits(p.collateral, tokenDecimals),
        payoutFormatted: formatUnits(p.payout, tokenDecimals),
      })),
    [parlays, tokenDecimals]
  );

  return {
    loading: loading || ordersRead.isLoading || configRead.isLoading,
    error:
      error || ordersRead.error?.message || configRead.error?.message || null,
    parlays: formatted,
    tokenDecimals,
    collateralToken,
  };
}
