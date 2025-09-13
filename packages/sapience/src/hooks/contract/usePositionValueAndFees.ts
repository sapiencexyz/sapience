import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import type { Abi, Address } from 'viem';
import type { Position as PositionType } from '@sapience/ui/types/graphql';
import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi';

type PositionKey = string; // `${chainId}:${address}:${positionId}`

export interface PositionValueFees {
  currentValue: bigint | null;
  feesBaseToken: bigint | null; // token0 (assumed base/Yes) in 18 decimals
  feesQuoteToken: bigint | null; // token1 (assumed quote/collateral) in collateral decimals
  feesValueInCollateral: bigint | null; // estimated using current price (base->collateral) + quote fees
}

// Minimal ABI fragment for Uniswap V3 NonfungiblePositionManager.positions(uint256)
const UNISWAP_POSITION_MANAGER_ABI = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
];

interface UsePositionValueAndFeesOptions {
  enabled?: boolean;
}

export function usePositionValueAndFees(
  positions: PositionType[] | undefined,
  options: UsePositionValueAndFeesOptions = {}
) {
  const { enabled = true } = options;
  const { abi } = useSapienceAbi();
  const sapienceAbi = abi as Abi;
  const SLOW_REFETCH_MS = 120_000; // 2 minutes
  // no-op

  const valid = useMemo(() => {
    return (positions || []).filter(
      (p) =>
        p &&
        p.positionId != null &&
        p.market?.marketGroup?.address &&
        p.market?.marketGroup?.chainId
    );
  }, [positions]);
  // no-op

  // Build maps and unique market keys
  const marketKeyFor = (p: PositionType) =>
    `${p.market!.marketGroup!.chainId}:${(p.market!.marketGroup!.address || '').toLowerCase()}:${p.market!.marketId}`;

  const uniqueMarkets = useMemo(() => {
    const map = new Map<
      string,
      { chainId: number; address: Address; marketId: bigint }
    >();
    for (const p of valid) {
      const key = marketKeyFor(p);
      if (!map.has(key)) {
        map.set(key, {
          chainId: p.market!.marketGroup!.chainId,
          address: p.market!.marketGroup!.address!.toLowerCase() as Address,
          marketId: BigInt(p.market!.marketId),
        });
      }
    }
    const arr = Array.from(map.values());
    return arr;
  }, [valid]);

  // 1) Read current reference price per market
  const refPriceContracts = useMemo(
    () =>
      uniqueMarkets.map((m) => ({
        abi: sapienceAbi,
        address: m.address,
        functionName: 'getReferencePrice',
        args: [m.marketId],
        chainId: m.chainId,
      })),
    [uniqueMarkets, sapienceAbi]
  );
  const refPriceQueryOptions = useMemo(
    () => ({
      enabled: enabled && uniqueMarkets.length > 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: SLOW_REFETCH_MS,
      staleTime: SLOW_REFETCH_MS,
    }),
    [enabled, uniqueMarkets.length]
  );
  const refPriceQuery = useReadContracts({
    contracts: refPriceContracts,
    query: refPriceQueryOptions,
  });

  const referencePriceByMarket = useMemo(() => {
    const result = new Map<string, bigint>();
    if (!refPriceQuery.data) return result;
    for (let i = 0; i < uniqueMarkets.length; i++) {
      const mk = uniqueMarkets[i];
      const key = `${mk.chainId}:${mk.address}:${mk.marketId.toString()}`;
      const val = (refPriceQuery.data[i]?.result as bigint) || 0n;
      result.set(key, val);
    }
    return result;
  }, [refPriceQuery.data, uniqueMarkets]);

  // 1b) Read market group params (to get Uniswap position manager) per unique group
  const uniqueGroups = useMemo(() => {
    const map = new Map<string, { chainId: number; address: Address }>();
    for (const p of valid) {
      const key = `${p.market!.marketGroup!.chainId}:${(p.market!.marketGroup!.address || '').toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          chainId: p.market!.marketGroup!.chainId,
          address: p.market!.marketGroup!.address!.toLowerCase() as Address,
        });
      }
    }
    const arr = Array.from(map.values());
    return arr;
  }, [valid]);

  const groupParamsContracts = useMemo(
    () =>
      uniqueGroups.map((g) => ({
        abi: sapienceAbi,
        address: g.address,
        functionName: 'getMarketGroup',
        args: [],
        chainId: g.chainId,
      })),
    [uniqueGroups, sapienceAbi]
  );
  const groupParamsQueryOptions = useMemo(
    () => ({
      enabled: enabled && uniqueGroups.length > 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: SLOW_REFETCH_MS,
      staleTime: SLOW_REFETCH_MS,
    }),
    [enabled, uniqueGroups.length]
  );
  const groupParamsQuery = useReadContracts({
    contracts: groupParamsContracts,
    query: groupParamsQueryOptions,
  });

  const uniswapManagerByGroup = useMemo(() => {
    const result = new Map<string, Address>();
    if (!groupParamsQuery.data) return result;
    for (let i = 0; i < uniqueGroups.length; i++) {
      const grp = uniqueGroups[i];
      const key = `${grp.chainId}:${grp.address}`;
      const resp = groupParamsQuery.data[i]?.result as any;
      // Support multiple ABI decoder shapes: tuple with named props or plain arrays
      const marketParams = resp?.marketParams ?? resp?.[2] ?? resp?.['2'];
      const candidateManager: string | undefined =
        marketParams?.uniswapPositionManager ?? marketParams?.[4];
      const manager = candidateManager
        ? (candidateManager.toLowerCase() as Address)
        : null;
      if (manager && manager !== ('0x' as Address)) {
        result.set(key, manager);
      }
    }
    return result;
  }, [groupParamsQuery.data, uniqueGroups]);

  // 2) Read current value and position struct per position
  const positionCalls = useMemo(() => {
    const calls: Array<{
      abi: Abi;
      address: Address;
      functionName: string;
      args: any[];
      chainId: number;
    }> = [];
    for (const p of valid) {
      const addr = p.market!.marketGroup!.address!.toLowerCase() as Address;
      const chainId = p.market!.marketGroup!.chainId;
      const posId = BigInt(p.positionId);
      calls.push({
        abi: sapienceAbi,
        address: addr,
        functionName: 'getPositionCollateralValue',
        args: [posId],
        chainId,
      });
      calls.push({
        abi: sapienceAbi,
        address: addr,
        functionName: 'getPosition',
        args: [posId],
        chainId,
      });
    }
    return calls;
  }, [valid, sapienceAbi]);

  const positionsQueryOptions = useMemo(
    () => ({
      enabled: enabled && positionCalls.length > 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: SLOW_REFETCH_MS,
      staleTime: SLOW_REFETCH_MS,
    }),
    [enabled, positionCalls.length]
  );
  const positionsQuery = useReadContracts({
    contracts: positionCalls,
    query: positionsQueryOptions,
  });

  // 3) Build Uniswap positions() queries only for LP positions with valid manager + tokenId
  const uniswapPlan = useMemo(() => {
    const empty = { contracts: [] as any[], indexMap: [] as number[] };
    if (!positionsQuery.data || positionsQuery.data.length === 0) return empty;

    const contracts: Array<{
      abi: Abi;
      address: Address;
      functionName: string;
      args: any[];
      chainId: number;
    }> = [];
    const indexMap: number[] = new Array(valid.length).fill(-1);

    for (let i = 0, pIdx = 0; i < valid.length; i++) {
      const posStructResp = positionsQuery.data[pIdx * 2 + 1];
      pIdx++;
      const res = posStructResp?.result as
        | {
            uniswapPositionId: bigint;
          }
        | undefined;
      const groupKey = `${valid[i].market!.marketGroup!.chainId}:${(valid[i].market!.marketGroup!.address || '').toLowerCase()}`;
      const manager = uniswapManagerByGroup.get(groupKey);
      const chainIdForPosition = valid[i].market!.marketGroup!.chainId;

      if (
        res &&
        res.uniswapPositionId &&
        manager &&
        manager !== ('0x' as Address)
      ) {
        indexMap[i] = contracts.length;
        contracts.push({
          abi: UNISWAP_POSITION_MANAGER_ABI as unknown as Abi,
          address: manager,
          functionName: 'positions',
          args: [res.uniswapPositionId],
          chainId: chainIdForPosition,
        });
      }
    }
    return { contracts, indexMap };
  }, [positionsQuery.data, valid, uniswapManagerByGroup]);

  const uniswapContracts = uniswapPlan.contracts;
  const uniswapQueryOptions = useMemo(
    () => ({
      enabled: enabled && uniswapContracts.length > 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: SLOW_REFETCH_MS,
      staleTime: SLOW_REFETCH_MS,
    }),
    [enabled, uniswapContracts.length]
  );
  const uniswapQuery = useReadContracts({
    contracts: uniswapContracts,
    query: uniswapQueryOptions,
  });

  // no-op

  // Build result map per position
  const dataByPositionId = useMemo(() => {
    const map = new Map<PositionKey, PositionValueFees>();
    if (!positionsQuery.data) return map;

    const toKey = (p: PositionType) =>
      `${p.market!.marketGroup!.chainId}:${(p.market!.marketGroup!.address || '').toLowerCase()}:${p.positionId}`;

    // Prepare collateral decimals and reference price per position
    const getRefPrice = (p: PositionType) =>
      referencePriceByMarket.get(
        `${p.market!.marketGroup!.chainId}:${(p.market!.marketGroup!.address || '').toLowerCase()}:${p.market!.marketId}`
      ) || 0n;

    for (let i = 0, posIdx = 0; i < valid.length; i++) {
      const position = valid[i];
      const key = toKey(position);
      const valueResp = positionsQuery.data[posIdx * 2];
      posIdx++;

      const currentValue = (valueResp?.result as bigint) ?? null;

      let feesBase: bigint | null = null;
      let feesQuote: bigint | null = null;
      const uniIdx = uniswapPlan.indexMap[i];
      if (
        uniIdx >= 0 &&
        uniswapQuery.data &&
        uniswapQuery.data[uniIdx] &&
        uniswapQuery.data[uniIdx].result
      ) {
        const uniRes = uniswapQuery.data[uniIdx].result as [
          bigint,
          string,
          string,
          string,
          number,
          number,
          number,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        // tokensOwed0 at index 10, tokensOwed1 at index 11
        feesBase = (uniRes[10] as unknown as bigint) || 0n;
        feesQuote = (uniRes[11] as unknown as bigint) || 0n;
        // no-op
      }

      // Estimate value of base fees using current price (priceD18)
      let feesValueInCollateral: bigint | null = null;
      if (feesBase != null || feesQuote != null) {
        const priceD18 = getRefPrice(position);
        const baseValue =
          feesBase != null ? (feesBase * priceD18) / 10n ** 18n : 0n;
        const quoteValue = feesQuote != null ? feesQuote : 0n;
        feesValueInCollateral = baseValue + quoteValue;
        // no-op
      }

      map.set(key, {
        currentValue,
        feesBaseToken: feesBase,
        feesQuoteToken: feesQuote,
        feesValueInCollateral,
      });
    }

    // no-op
    return map;
  }, [positionsQuery.data, uniswapQuery.data, referencePriceByMarket, valid]);

  const isLoading =
    refPriceQuery.isLoading ||
    positionsQuery.isLoading ||
    (uniswapContracts.length > 0 && uniswapQuery.isLoading);

  const isRefetching =
    refPriceQuery.isRefetching ||
    positionsQuery.isRefetching ||
    (uniswapContracts.length > 0 && uniswapQuery.isRefetching);

  const refetch = async () => {
    await Promise.all([
      refPriceQuery.refetch?.(),
      positionsQuery.refetch?.(),
      uniswapQuery.refetch?.(),
    ]);
  };

  return { dataByPositionId, isLoading, isRefetching, refetch };
}
