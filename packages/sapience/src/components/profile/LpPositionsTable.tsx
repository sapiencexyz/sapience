'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import type { PositionType } from '@sapience/ui/types';
import SettlePositionButton from '../markets/SettlePositionButton';
import SharePositionDialog from '../markets/SharePositionDialog';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import { getChainShortName, tickToPrice } from '~/lib/utils/util';

interface LpPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
  showHeader?: boolean;
  showActions?: boolean;
}

// Helper component for Collateral Cell
function CollateralCell({ position }: { position: PositionType }) {
  const decimals = position.market?.marketGroup?.collateralDecimals || 18; // Default to 18 if not provided
  const symbol = position.market?.marketGroup?.collateralSymbol || 'Tokens';

  const displayValue = Number(
    formatUnits(BigInt(position.collateral), decimals)
  );

  return (
    <div className="flex items-center gap-1">
      <NumberDisplay value={displayValue} />
      <span className="text-muted-foreground text-sm">{symbol}</span>
    </div>
  );
}

// Helper chip for displaying range and in-range status
function RangeStatusCell({ position }: { position: PositionType }) {
  const marketGroup = position.market?.marketGroup;
  const unitBase = `${marketGroup?.baseTokenName || 'Base'}`;
  const unitQuote = `${marketGroup?.collateralSymbol || 'Quote'}`;
  const hideQuote = (unitQuote || '').toUpperCase().includes('USD');
  const priceUnit =
    unitBase === 'Yes'
      ? ''
      : hideQuote
        ? `${unitBase}`
        : `${unitBase}/${unitQuote}`;

  const lowPrice = tickToPrice(position.lowPriceTick);
  const highPrice = tickToPrice(position.highPriceTick);

  const address = marketGroup?.address || '';
  const chainId = marketGroup?.chainId || 0;
  const marketId = position.market?.marketId;

  const { data: currentMarketPriceRaw } = useMarketPrice(
    address,
    chainId,
    marketId
  );
  const currentMarketPrice = currentMarketPriceRaw ?? 0;

  const inRange =
    currentMarketPrice >= lowPrice && currentMarketPrice <= highPrice;

  return (
    <div className="whitespace-nowrap text-sm flex items-center gap-2">
      <span>
        <NumberDisplay value={lowPrice} /> → <NumberDisplay value={highPrice} />{' '}
        {priceUnit}
      </span>
      <Badge
        variant="outline"
        className={
          inRange
            ? 'border-green-500/40 bg-green-500/10 text-green-600'
            : 'border-red-500/40 bg-red-500/10 text-red-600'
        }
      >
        {inRange ? 'In Range' : 'Out of Range'}
      </Badge>
    </div>
  );
}

export default function LpPositionsTable({
  positions,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
  showHeader = true,
  showActions = true,
}: LpPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId; // True for a specific market page (with marketId)
  const isProfilePageContext = !parentMarketAddress && !parentChainId; // True if on profile page context

  if (!positions || positions.length === 0) {
    return <EmptyTabState message="No liquidity positions found" />;
  }

  const validPositions = positions.filter(
    (p) =>
      p &&
      p.market &&
      p.market?.marketGroup &&
      p.id &&
      p.isLP && // Ensure it's an LP position
      p.lowPriceTick !== undefined && // Check necessary fields exist
      p.highPriceTick !== undefined &&
      p.lpBaseToken !== undefined &&
      p.lpQuoteToken !== undefined
  );

  if (validPositions.length === 0) {
    return <EmptyTabState message="No liquidity positions found" />;
  }

  let displayQuestionColumn;
  if (isProfilePageContext) {
    displayQuestionColumn = true; // Always show on profile page
  } else if (isMarketPage) {
    // Specific market page
    displayQuestionColumn = false; // Never show on specific market page
  } else {
    // Market group page (parentMarketAddress & parentChainId are present, but parentMarketId is not)
    displayQuestionColumn = validPositions.some(
      (p) =>
        p.market?.marketGroup &&
        p.market?.marketGroup?.markets &&
        p.market?.marketGroup?.markets.length > 1
    );
  }

  // Sort newest to oldest by createdAt; fallback to latest transaction timestamp
  const getPositionCreatedMs = (p: PositionType) => {
    const direct = (p as any).createdAt as unknown as string | undefined;
    if (direct) {
      const ms = new Date(direct).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    const latestTxn = (p.transactions || [])
      .map((t) => new Date(t.createdAt as unknown as string).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    return latestTxn || 0;
  };

  const sortedPositions = [...validPositions].sort(
    (a, b) => getPositionCreatedMs(b) - getPositionCreatedMs(a)
  );

  return (
    <div>
      {showHeader && <h3 className="font-medium mb-4">Liquidity Positions</h3>}
      <div className="rounded border bg-background dark:bg-muted/50">
        {/* Header (desktop) to mirror Trader layout */}
        <div
          className={`hidden xl:grid ${
            showActions
              ? 'xl:[grid-template-columns:repeat(11,minmax(0,1fr))_auto]'
              : 'xl:[grid-template-columns:repeat(11,minmax(0,1fr))]'
          } items-center h-12 px-4 text-sm font-medium text-muted-foreground border-b`}
        >
          {displayQuestionColumn && (
            <div className="xl:col-span-5">Prediction Market</div>
          )}
          <div
            className={
              displayQuestionColumn ? 'xl:col-span-3' : 'xl:col-span-5'
            }
          >
            Collateral
          </div>
          <div
            className={
              (displayQuestionColumn ? 'xl:col-span-3' : 'xl:col-span-6') +
              ' flex items-center gap-1'
            }
          >
            <span>Range</span>
          </div>
          {showActions && (
            <div className="xl:col-start-12 xl:col-span-1 xl:justify-self-end">
              <div className="invisible flex gap-3" aria-hidden>
                <Button size="sm" variant="outline">
                  Modify
                </Button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                >
                  Share
                </button>
              </div>
            </div>
          )}
        </div>

        {sortedPositions.map((position: PositionType) => {
          const { marketGroup } = position.market || {};
          const isClosed =
            position.lpBaseToken === '0' && position.lpQuoteToken === '0';

          const chainShortName = marketGroup?.chainId
            ? getChainShortName(marketGroup.chainId)
            : 'unknown';
          const positionUrl = `/markets/${chainShortName}:${marketGroup?.address}/${position.market?.marketId}?positionId=${position.positionId}`;

          const isOwner =
            connectedAddress &&
            position.owner &&
            connectedAddress.toLowerCase() === position.owner.toLowerCase();

          const endTimestamp = position.market?.endTimestamp;
          const isPositionSettled = position.isSettled || false;
          const now = Date.now();
          const isExpired = endTimestamp
            ? Number(endTimestamp) * 1000 < now
            : false;

          const marketAddress = marketGroup?.address || '';
          const chainId = marketGroup?.chainId || 0;

          return (
            <div
              key={position.id}
              className="px-4 py-4 xl:py-4 border-b last:border-b-0"
            >
              <div
                className={`flex flex-col gap-3 xl:grid ${
                  showActions
                    ? 'xl:[grid-template-columns:repeat(11,minmax(0,1fr))_auto]'
                    : 'xl:[grid-template-columns:repeat(11,minmax(0,1fr))]'
                } xl:items-center`}
              >
                {displayQuestionColumn && (
                  <div className="xl:col-span-5">
                    {(() => {
                      const mGroup = position.market?.marketGroup;
                      const mId = position.market?.marketId;
                      const question = position.market?.question || 'N/A';
                      if (!mGroup?.address || mId === undefined) {
                        return (
                          <div className="space-y-2">
                            <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                              {question}
                            </h2>
                            <div className="text-sm text-muted-foreground">
                              Position #{position.positionId}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                            <Link
                              href={`/markets/${chainShortName}:${mGroup.address}/${mId}`}
                              className="group"
                            >
                              <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                                {question}
                              </span>
                            </Link>
                          </h2>
                          <div className="text-sm text-muted-foreground">
                            Position #{position.positionId}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {isClosed ? (
                  <div className="xl:col-span-7 text-center font-medium text-muted-foreground tracking-wider">
                    CLOSED
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        displayQuestionColumn
                          ? 'xl:col-span-3'
                          : 'xl:col-span-5'
                      }
                    >
                      <div className="text-xs text-muted-foreground xl:hidden">
                        Collateral
                      </div>
                      <CollateralCell position={position} />
                    </div>

                    <div
                      className={
                        displayQuestionColumn
                          ? 'xl:col-span-3'
                          : 'xl:col-span-6'
                      }
                    >
                      <div className="text-xs text-muted-foreground xl:hidden">
                        Range
                      </div>
                      <RangeStatusCell position={position} />
                    </div>

                    {showActions && (
                      <div className="mt-3 xl:mt-0 xl:col-span-1 xl:col-start-12 xl:justify-self-end">
                        <div className="flex gap-3 justify-start xl:justify-end">
                          {isExpired && !isPositionSettled ? (
                            isOwner ? (
                              <SettlePositionButton
                                positionId={position.positionId.toString()}
                                marketAddress={marketAddress}
                                chainId={chainId}
                                isMarketSettled={
                                  position.market?.settled || false
                                }
                                onSuccess={() => {
                                  console.log(
                                    `Settle action for LP position ${position.positionId} initiated. Consider a data refetch.`
                                  );
                                }}
                              />
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        Settle
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-[220px]">
                                      {connectedAddress
                                        ? 'You can only settle positions from the account that owns them.'
                                        : 'Connect your account to settle this position.'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          ) : (
                            !isMarketPage &&
                            (isOwner && !isClosed ? (
                              <Link href={positionUrl} passHref>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                                >
                                  Modify
                                </button>
                              </Link>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        Modify
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-[220px]">
                                      {!connectedAddress
                                        ? 'Connect your wallet to modify this position.'
                                        : isClosed
                                          ? 'This position is already closed.'
                                          : 'You can only modify from the account that owns this position.'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))
                          )}

                          <SharePositionDialog
                            position={position}
                            trigger={
                              <button
                                type="button"
                                className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                              >
                                Share
                              </button>
                            }
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
