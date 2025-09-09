import { Button } from '@sapience/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
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
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { getChainShortName, tickToPrice } from '~/lib/utils/util';

interface LpPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
  showHeader?: boolean;
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

// Helper component for Virtual Token Cells
function VirtualTokenCell({
  value,
  unit,
}: {
  value: string | number | undefined | null;
  unit: string;
}) {
  const displayValue = Number(
    formatUnits(BigInt(value?.toString() || '0'), 18)
  );

  return (
    <div className="flex items-center gap-1">
      <NumberDisplay value={displayValue} />
      <span className="text-muted-foreground text-sm">{unit}</span>
    </div>
  );
}

// Helper component for Price Tick Cells
function PriceTickCell({
  tick,
  unit,
}: {
  tick: string | number | undefined | null;
  unit: string;
}) {
  const price = tickToPrice(tick);
  return (
    <div className="flex items-center gap-1">
      <NumberDisplay value={price} />
      <span className="text-muted-foreground text-sm">{unit}</span>
    </div>
  );
}

// removed Unrealized PnL column and related header

export default function LpPositionsTable({
  positions,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
  showHeader = true,
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
      <div className="rounded border">
        <Table>
          <TableHeader className="hidden md:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
            <TableRow>
              {displayQuestionColumn && <TableHead>Question</TableHead>}
              <TableHead>Collateral</TableHead>
              <TableHead>Base Tokens</TableHead>
              <TableHead>Quote Tokens</TableHead>
              <TableHead>Low Price</TableHead>
              <TableHead>High Price</TableHead>
              {/* Removed Unrealized PnL column */}
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPositions.map((position: PositionType) => {
              const { marketGroup } = position.market || {};
              const baseUnit = `${marketGroup?.baseTokenName || 'Base'}`;
              const quoteUnit = `${marketGroup?.collateralSymbol || 'Quote'}`;
              const hideQuote = (quoteUnit || '').toUpperCase().includes('USD');
              const priceUnit =
                baseUnit === 'Yes'
                  ? ''
                  : hideQuote
                    ? `${baseUnit}`
                    : `${baseUnit}/${quoteUnit}`;

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

              const numColumns = displayQuestionColumn ? 7 : 6;

              return (
                <TableRow
                  key={position.id}
                  className="md:table-row block border-b space-y-3 md:space-y-0 px-4 py-4 md:py-0"
                >
                  {displayQuestionColumn && (
                    <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                      <div className="space-y-2">
                        {(() => {
                          const mGroup = position.market?.marketGroup;
                          const mId = position.market?.marketId;
                          const question = position.market?.question || 'N/A';
                          if (!mGroup?.address || mId === undefined) {
                            return (
                              <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                                {question}
                              </h2>
                            );
                          }
                          return (
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
                          );
                        })()}
                        <div className="text-sm text-muted-foreground">
                          Position #{position.positionId}
                        </div>
                      </div>
                    </TableCell>
                  )}

                  {isClosed ? (
                    <TableCell
                      colSpan={numColumns}
                      className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3 text-center font-medium text-muted-foreground align-middle tracking-wider"
                    >
                      CLOSED
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                        <div className="text-xs text-muted-foreground md:hidden">
                          Collateral
                        </div>
                        <CollateralCell position={position} />
                      </TableCell>

                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                        <div className="text-xs text-muted-foreground md:hidden">
                          Base Tokens
                        </div>
                        <VirtualTokenCell
                          value={position.lpBaseToken}
                          unit={baseUnit}
                        />
                      </TableCell>

                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                        <div className="text-xs text-muted-foreground md:hidden">
                          Quote Tokens
                        </div>
                        <VirtualTokenCell
                          value={position.lpQuoteToken}
                          unit={quoteUnit}
                        />
                      </TableCell>

                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                        <div className="text-xs text-muted-foreground md:hidden">
                          Low Price
                        </div>
                        <PriceTickCell
                          tick={position.lowPriceTick}
                          unit={priceUnit}
                        />
                      </TableCell>

                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3">
                        <div className="text-xs text-muted-foreground md:hidden">
                          High Price
                        </div>
                        <PriceTickCell
                          tick={position.highPriceTick}
                          unit={priceUnit}
                        />
                      </TableCell>

                      {/* Removed Unrealized PnL value cell */}

                      <TableCell className="block md:table-cell w-full px-0 py-0 md:px-4 md:py-3 text-left md:text-right whitespace-nowrap md:mt-0">
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
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
