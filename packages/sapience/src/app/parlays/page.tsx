'use client';

import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { erc20Abi } from 'viem';
import { Badge } from '@sapience/ui/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { useParlays } from '~/hooks/useParlays';
import { useFillParlayOrder } from '~/hooks/forms/useFillParlayOrder';
import { getChainShortName } from '~/lib/utils/util';
import { useMarkets } from '~/hooks/graphql/useMarkets';
import UserParlaysTable from '~/components/parlays/UserParlaysTable';

function formatTimeUntil(timestampSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = timestampSec - now;
  if (delta <= 0) return 'expired';
  const minutes = Math.floor(delta / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  return `in ${minutes} min`;
}

type PredictedOutcome = {
  prediction: boolean;
  market: { marketGroup: Address; marketId: bigint };
};

function PredictedOutcomeBadge({
  outcome,
  href,
  question,
}: {
  outcome: PredictedOutcome;
  href: string;
  question?: string;
}) {
  const yesNo = outcome.prediction ? 'Yes' : 'No';
  const fallbackText = `${yesNo} #${outcome.market.marketId.toString()}`;
  const colorClasses = outcome.prediction
    ? 'border-green-500/30 bg-green-500/10 text-green-600'
    : 'border-red-500/30 bg-red-500/10 text-red-600';
  return (
    <Link href={href} className="inline-flex">
      <Badge
        variant="outline"
        className={`px-2 py-0.5 text-xs hover:opacity-90 cursor-pointer ${colorClasses}`}
      >
        {question ? (
          <>
            <span className="font-light">{question}&nbsp;</span>
            <span className="font-medium">{yesNo}</span>
          </>
        ) : (
          fallbackText
        )}
      </Badge>
    </Link>
  );
}

function OutcomesCell({
  outcomes,
  chainShortName = 'arb1',
  questionsMap,
  chainId,
}: {
  outcomes: PredictedOutcome[];
  chainShortName?: string;
  questionsMap: Map<string, string>;
  chainId: number;
}) {
  if (!outcomes?.length)
    return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {outcomes.map((outcome, idx) => {
        const href = `/markets/${chainShortName}:${outcome.market.marketGroup.toLowerCase()}/${outcome.market.marketId.toString()}`;
        const qKey = `${chainId}:${outcome.market.marketGroup.toLowerCase()}:${Number(outcome.market.marketId)}`;
        const question = questionsMap.get(qKey);
        return (
          <PredictedOutcomeBadge
            key={`${outcome.market.marketGroup}-${outcome.market.marketId.toString()}-${idx}`}
            outcome={outcome}
            href={href}
            question={question}
          />
        );
      })}
    </div>
  );
}

const ParlaysPage = () => {
  const { address, chainId } = useAccount();
  const {
    loading,
    parlays,
    byId,
    collateralToken,
    tokenDecimals,
    unfilledIds,
  } = useParlays({ account: address, chainId });

  const defaultChainShortName = getChainShortName(chainId ?? 42161);

  // ERC20 symbol (optional polish)
  const symbolRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId,
          },
        ]
      : [],
    query: { enabled: !!collateralToken },
  });

  const collateralSymbol: string | undefined = useMemo(() => {
    const item = symbolRead.data?.[0];
    if (item && item.status === 'success') return String(item.result);
    return undefined;
  }, [symbolRead.data]);

  const openOrders = useMemo(
    () => (parlays || []).filter((p: any) => !p.filled),
    [parlays]
  );

  // Collect all unique markets to query questions in one batch
  const marketsForQuery = useMemo(() => {
    const set = new Set<string>();
    const out: { address: string; marketId: number }[] = [];
    for (const p of parlays || []) {
      for (const o of p.predictedOutcomes || []) {
        const address = String(o.market.marketGroup).toLowerCase();
        const mid = Number(o.market.marketId);
        const key = `${address}:${mid}`;
        if (!set.has(key)) {
          set.add(key);
          out.push({ address, marketId: mid });
        }
      }
    }
    return out;
  }, [parlays]);

  const effectiveChainId = chainId ?? 42161;
  const { questionsMap } = useMarkets({
    chainId: effectiveChainId,
    markets: marketsForQuery,
  });

  // myIds now provided by useParlays multicall

  return (
    <div className="container mx-auto max-w-6xl px-4">
      <div className="py-16 md:py-24">
        <h1 className="text-2xl md:text-3xl font-heading mb-6 flex items-center gap-4">
          Parlays
          <Badge
            variant="outline"
            className="px-1.5 py-0.5 text-xs font-medium border-yellow-500/40 bg-yellow-500/10 text-yellow-600 inline-flex items-center gap-1 mr-4"
          >
            <AlertTriangle className="w-3 h-3" />
            Experimental Feature
          </Badge>
        </h1>
        <h2 className="text-lg font-medium mb-3">Open Orders</h2>
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">ID</TableHead>
                <TableHead className="whitespace-nowrap">Maker</TableHead>
                <TableHead className="whitespace-nowrap">
                  Predicted Outcomes
                </TableHead>
                <TableHead className="whitespace-nowrap">Fill Amount</TableHead>
                <TableHead className="whitespace-nowrap">
                  Total Payout
                </TableHead>
                <TableHead className="whitespace-nowrap">Expires</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Loading parlays...
                  </TableCell>
                </TableRow>
              ) : (unfilledIds?.length ?? 0) === 0 &&
                openOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No open orders
                  </TableCell>
                </TableRow>
              ) : (unfilledIds?.length ?? 0) > 0 ? (
                unfilledIds.map((id) => {
                  const order = byId.get(id.toString());
                  return order ? (
                    <OpenOrderRow
                      key={id.toString()}
                      order={order}
                      address={address}
                      chainId={chainId}
                      collateralSymbol={collateralSymbol}
                      tokenDecimals={tokenDecimals}
                      defaultChainShortName={defaultChainShortName}
                      questionsMap={questionsMap}
                      effectiveChainId={effectiveChainId}
                    />
                  ) : (
                    <TableRow key={id.toString()}>
                      <TableCell className="font-mono align-middle">
                        {id.toString()}
                      </TableCell>
                      <TableCell className="align-middle">—</TableCell>
                      <TableCell className="align-middle">—</TableCell>
                      <TableCell className="align-middle">—</TableCell>
                      <TableCell className="align-middle">—</TableCell>
                      <TableCell className="align-middle">—</TableCell>
                      <TableCell className="text-right align-middle">
                        —
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                openOrders.map((order: any) => (
                  <OpenOrderRow
                    key={order.id.toString()}
                    order={order}
                    address={address}
                    chainId={chainId}
                    collateralSymbol={collateralSymbol}
                    tokenDecimals={tokenDecimals}
                    defaultChainShortName={defaultChainShortName}
                    questionsMap={questionsMap}
                    effectiveChainId={effectiveChainId}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {address && (
          <div className="mt-10">
            <UserParlaysTable account={address} />
          </div>
        )}
      </div>
    </div>
  );
};

function OpenOrderRow({
  order,
  address,
  chainId,
  collateralSymbol,
  tokenDecimals,
  defaultChainShortName,
  questionsMap,
  effectiveChainId,
}: {
  order: any;
  address?: Address;
  chainId?: number;
  collateralSymbol?: string;
  tokenDecimals?: number;
  defaultChainShortName: string;
  questionsMap: Map<string, string>;
  effectiveChainId: number;
}) {
  const isMaker =
    !!address &&
    order.maker?.toLowerCase() === (address as string).toLowerCase();
  const canFill = !order.filled && !isMaker;

  const { fillParlay, isFilling } = useFillParlayOrder({
    requestId: BigInt(order.id),
    payout: BigInt(order.payout),
    collateral: BigInt(order.collateral),
    chainId,
    enabled: canFill,
  });

  const delta = useMemo(() => {
    try {
      const d = BigInt(order.payout) - BigInt(order.collateral);
      return d < 0n ? 0n : d;
    } catch {
      return 0n;
    }
  }, [order.payout, order.collateral]);

  const fillAmountFormatted = useMemo(() => {
    // order already has formatted fields; fall back to raw if missing
    if (
      typeof order.payoutFormatted === 'string' &&
      typeof order.collateralFormatted === 'string'
    ) {
      const num =
        Number(order.payoutFormatted) - Number(order.collateralFormatted);
      if (!Number.isFinite(num)) return undefined;
      const fixed = num.toFixed(2);
      return String(parseFloat(fixed));
    }
    // fallback: display raw in token decimals if provided
    if (tokenDecimals != null) {
      try {
        const factor = 10 ** tokenDecimals;
        const val = Number(delta) / factor;
        const fixed = val.toFixed(2);
        return String(parseFloat(fixed));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [order.payoutFormatted, order.collateralFormatted, tokenDecimals, delta]);

  return (
    <TableRow>
      <TableCell className="font-mono align-middle">
        {order.id.toString()}
      </TableCell>
      <TableCell className="align-middle">
        <AddressDisplay address={order.maker as Address} />
      </TableCell>
      <TableCell className="align-middle">
        <OutcomesCell
          outcomes={order.predictedOutcomes}
          chainShortName={defaultChainShortName}
          questionsMap={questionsMap}
          chainId={effectiveChainId}
        />
      </TableCell>
      <TableCell className="align-middle">
        <span className="text-muted-foreground">
          {fillAmountFormatted ?? '—'} {collateralSymbol || 'TOKEN'}
        </span>
      </TableCell>
      <TableCell className="align-middle">
        <span className="text-muted-foreground">
          {order.payoutFormatted} {collateralSymbol || 'TOKEN'}
        </span>
      </TableCell>
      <TableCell className="align-middle">
        <span className="text-muted-foreground">
          {formatTimeUntil(Number(order.orderExpirationTime))}
        </span>
      </TableCell>
      <TableCell className="text-right align-middle">
        <Button
          size="sm"
          onClick={() => fillParlay()}
          disabled={isFilling || !canFill}
        >
          {isFilling ? 'Filling…' : 'Fill'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default ParlaysPage;
