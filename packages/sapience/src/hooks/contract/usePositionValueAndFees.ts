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

  const valid = useMemo(() => {
    return (positions || []).filter(
      (p) =>
        p &&
        p.positionId != null &&
        p.market?.marketGroup?.address &&
        p.market?.marketGroup?.chainId
    );
  }, [positions]);

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
    return Array.from(map.values());
  }, [valid]);

  // 1) Read current reference price per market
  const refPriceQuery = useReadContracts({
    contracts: uniqueMarkets.map((m) => ({
      abi: sapienceAbi,
      address: m.address,
      functionName: 'getReferencePrice',
      args: [m.marketId],
      chainId: m.chainId,
    })),
    query: { enabled: enabled && uniqueMarkets.length > 0 },
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

  const positionsQuery = useReadContracts({
    contracts: positionCalls,
    query: { enabled: enabled && positionCalls.length > 0 },
  });

  // 3) After we have uniswapPositionIds, compute Uniswap positions() inputs for tokensOwed
  const uniswapQueriesInput = useMemo(() => {
    if (!positionsQuery.data || positionsQuery.data.length === 0)
      return [] as Array<{
        manager: Address;
        tokenId: bigint;
        chainId: number;
      }>;
    const inputs: Array<{
      manager: Address;
      tokenId: bigint;
      chainId: number;
    }> = [];
    for (let i = 0, pIdx = 0; i < valid.length; i++) {
      // Each position contributes two calls in order: value, position
      const posStructResp = positionsQuery.data[pIdx * 2 + 1];
      pIdx++;
      const res = posStructResp?.result as
        | {
            id: bigint;
            kind: number;
            marketId: bigint;
            depositedCollateralAmount: bigint;
            borrowedVQuote: bigint;
            borrowedVBase: bigint;
            vQuoteAmount: bigint;
            vBaseAmount: bigint;
            uniswapPositionId: bigint;
            isSettled: boolean;
          }
        | undefined;
      const manager = (valid[i].market?.marketGroup
        ?.marketParamsUniswappositionmanager ||
        valid[i].market?.marketParamsUniswappositionmanager ||
        '') as Address;
      if (res && res.uniswapPositionId && manager && manager !== '0x') {
        inputs.push({
          manager: manager,
          tokenId: res.uniswapPositionId,
          chainId: valid[i].market!.marketGroup!.chainId,
        });
      } else {
        inputs.push({
          manager: '0x0000000000000000000000000000000000000000' as Address,
          tokenId: 0n,
          chainId: valid[i].market!.marketGroup!.chainId,
        });
      }
    }
    return inputs;
  }, [positionsQuery.data, valid]);

  const uniswapQuery = useReadContracts({
    contracts: (uniswapQueriesInput || []).map((q) => ({
      abi: UNISWAP_POSITION_MANAGER_ABI as unknown as Abi,
      address: q.manager,
      functionName: 'positions',
      args: [q.tokenId],
      chainId: q.chainId,
    })),
    query: {
      enabled:
        enabled && !!uniswapQueriesInput && uniswapQueriesInput.length > 0,
    },
  });

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
      if (
        uniswapQuery.data &&
        uniswapQuery.data[i] &&
        uniswapQuery.data[i].result
      ) {
        const uniRes = uniswapQuery.data[i].result as [
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
      }

      // Estimate value of base fees using current price (priceD18)
      let feesValueInCollateral: bigint | null = null;
      if (feesBase != null || feesQuote != null) {
        const priceD18 = getRefPrice(position);
        const baseValue =
          feesBase != null ? (feesBase * priceD18) / 10n ** 18n : 0n;
        const quoteValue = feesQuote != null ? feesQuote : 0n;
        feesValueInCollateral = baseValue + quoteValue;
      }

      map.set(key, {
        currentValue,
        feesBaseToken: feesBase,
        feesQuoteToken: feesQuote,
        feesValueInCollateral,
      });
    }

    return map;
  }, [positionsQuery.data, uniswapQuery.data, referencePriceByMarket, valid]);

  const isLoading =
    refPriceQuery.isLoading ||
    positionsQuery.isLoading ||
    (uniswapQueriesInput != null && uniswapQuery.isLoading);

  const isRefetching =
    refPriceQuery.isRefetching ||
    positionsQuery.isRefetching ||
    (uniswapQueriesInput != null && uniswapQuery.isRefetching);

  const refetch = async () => {
    await Promise.all([
      refPriceQuery.refetch?.(),
      positionsQuery.refetch?.(),
      uniswapQuery.refetch?.(),
    ]);
  };

  return { dataByPositionId, isLoading, isRefetching, refetch };
}
