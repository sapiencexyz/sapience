'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { erc20Abi } from 'viem';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';

import { getChainShortName } from '~/lib/utils/util';
import { useParlays } from '~/hooks/useParlays';
import { useMarkets } from '~/hooks/graphql/useMarkets';

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

export default function UserParlaysTable({
  account,
  chainId,
  showHeaderText = true,
}: {
  account: Address;
  chainId?: number;
  showHeaderText?: boolean;
}) {
  const { chainId: connectedChainId } = useAccount();
  const resolvedChainId = chainId ?? connectedChainId;

  const { loading, parlays, byId, collateralToken, myIds } = useParlays({
    account,
    chainId: resolvedChainId,
  });

  const defaultChainShortName = getChainShortName(resolvedChainId ?? 42161);

  // ERC20 symbol (optional polish)
  const symbolRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: resolvedChainId,
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

  const effectiveChainId = resolvedChainId ?? 42161;
  const { questionsMap } = useMarkets({
    chainId: effectiveChainId,
    markets: marketsForQuery,
  });

  return (
    <div>
      {showHeaderText && (
        <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
      )}
      <div className="w-full overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">ID</TableHead>
              <TableHead className="whitespace-nowrap">Role</TableHead>
              <TableHead className="whitespace-nowrap">
                Predicted Outcomes
              </TableHead>
              <TableHead className="whitespace-nowrap">Collateral</TableHead>
              <TableHead className="whitespace-nowrap">Total Payout</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading your parlays...
                </TableCell>
              </TableRow>
            ) : myIds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  You have no parlays yet
                </TableCell>
              </TableRow>
            ) : (
              myIds.map((id) => {
                const p = byId.get(id.toString());
                return (
                  <TableRow key={id.toString()}>
                    <TableCell className="font-mono align-middle">
                      {id.toString()}
                    </TableCell>
                    <TableCell className="align-middle">
                      {p &&
                      account &&
                      p.maker?.toLowerCase() === account.toLowerCase()
                        ? 'Maker'
                        : p && account
                          ? 'Taker'
                          : '—'}
                    </TableCell>
                    <TableCell className="align-middle">
                      {p ? (
                        <OutcomesCell
                          outcomes={p.predictedOutcomes}
                          chainShortName={defaultChainShortName}
                          questionsMap={questionsMap}
                          chainId={effectiveChainId}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {p ? (
                        <span className="text-muted-foreground">
                          {p.collateralFormatted} {collateralSymbol || 'TOKEN'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {p ? (
                        <span className="text-muted-foreground">
                          {p.payoutFormatted} {collateralSymbol || 'TOKEN'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {p ? (
                        p.settled ? (
                          <Badge
                            variant={p.makerWon ? 'default' : 'secondary'}
                            className="px-2 py-0.5 text-xs"
                          >
                            {p.makerWon ? 'Maker Won' : 'Taker Won'}
                          </Badge>
                        ) : p.filled ? (
                          <span className="text-muted-foreground">Active</span>
                        ) : (
                          <span className="text-muted-foreground">Open</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
