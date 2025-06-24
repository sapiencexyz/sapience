import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import type { PositionType } from '@foil/ui/types';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

import SettlePositionButton from '../forecasting/SettlePositionButton';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { getChainShortName, tickToPrice } from '~/lib/utils/util';

interface LpPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
  showHeader?: boolean;
}

// Helper component for Market Cell (similar to app package but simpler for now)
function MarketCell({ position }: { position: PositionType }) {
  return position.market?.question || 'N/A';
}

// Helper component for Collateral Cell
function CollateralCell({ position }: { position: PositionType }) {
  const decimals = position.market?.marketGroup?.collateralDecimals || 18; // Default to 18 if not provided
  const symbol = position.market?.marketGroup?.collateralSymbol || 'Tokens';
  const displayValue = Number(position.collateral) / 10 ** decimals;

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
  const displayValue = Number(formatEther(BigInt(value?.toString() || '0')));
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

// Helper component for PnL Header Cell
function PnLHeaderCell() {
  return (
    <span className="flex items-center gap-1 ">
      Unrealized Profit/Loss{' '}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Info className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-normal">
              Estimate ignoring slippage and fees. May not be applicable if
              market is closed.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

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
    return null;
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
    return null;
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

  return (
    <div>
      {showHeader && <h3 className="font-medium mb-4">Liquidity Positions</h3>}
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead> {/* Header for Position ID */}
              {displayQuestionColumn && <TableHead>Question</TableHead>}
              <TableHead>Collateral</TableHead>
              <TableHead>Base Tokens</TableHead> {/* Updated Header */}
              <TableHead>Quote Tokens</TableHead> {/* Updated Header */}
              <TableHead>Low Price</TableHead>
              <TableHead>High Price</TableHead>
              <TableHead>
                <PnLHeaderCell />
              </TableHead>
              <TableHead /> {/* Header for More Info */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {validPositions.map((position: PositionType) => {
              const { marketGroup } = position.market || {};
              const baseUnit = `${marketGroup?.baseTokenName || 'Base'}`;
              const quoteUnit = `${marketGroup?.collateralSymbol || 'Quote'}`;
              const priceUnit = `${marketGroup?.collateralSymbol || 'Quote'}/${marketGroup?.baseTokenName || 'Base'}`;

              const isClosed =
                position.lpBaseToken === '0' && position.lpQuoteToken === '0';

              const chainShortName = marketGroup?.chainId
                ? getChainShortName(marketGroup.chainId)
                : 'unknown';
              const positionUrl = `/positions/${chainShortName}:${marketGroup?.address}/${position.market?.marketId}?positionId=${position.positionId}`;

              // For displaying PnL, we'll need to adapt since totalPnL might not exist
              // We'll just show N/A in that case
              const pnlContent = (
                <span className="text-muted-foreground">N/A</span>
              );

              // Logic for Settle/View button
              const isOwner =
                connectedAddress &&
                position.owner &&
                connectedAddress.toLowerCase() === position.owner.toLowerCase();

              const endTimestamp = position.market?.endTimestamp;
              // Assuming PositionType might include isSettled for LPs, defaulting to false
              const isPositionSettled = position.isSettled || false;
              const now = Date.now();
              const isExpired = endTimestamp
                ? Number(endTimestamp) * 1000 < now
                : false;

              const marketAddress = marketGroup?.address || '';
              const chainId = marketGroup?.chainId || 0;

              return (
                <TableRow
                  key={position.id}
                  className={isClosed ? 'min-h-[69px]' : ''}
                >
                  <TableCell className="text-muted-foreground">
                    #{position.positionId}
                  </TableCell>
                  {displayQuestionColumn && (
                    <TableCell>
                      <MarketCell position={position} />
                    </TableCell>
                  )}
                  {isClosed ? (
                    <TableCell
                      colSpan={displayQuestionColumn ? 9 : 8} // Adjusted colSpan
                      className="text-center font-medium text-muted-foreground align-middle tracking-wider"
                    >
                      CLOSED
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <CollateralCell position={position} />
                      </TableCell>
                      <TableCell>
                        <VirtualTokenCell
                          value={position.lpBaseToken}
                          unit={baseUnit}
                        />
                      </TableCell>
                      <TableCell>
                        <VirtualTokenCell
                          value={position.lpQuoteToken}
                          unit={quoteUnit}
                        />
                      </TableCell>
                      <TableCell>
                        <PriceTickCell
                          tick={position.lowPriceTick}
                          unit={priceUnit}
                        />
                      </TableCell>
                      <TableCell>
                        <PriceTickCell
                          tick={position.highPriceTick}
                          unit={priceUnit}
                        />
                      </TableCell>
                      <TableCell>{pnlContent}</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          if (!isClosed && isOwner) {
                            if (isExpired && !isPositionSettled) {
                              return (
                                <SettlePositionButton
                                  positionId={position.positionId.toString()}
                                  marketAddress={marketAddress}
                                  chainId={chainId}
                                  onSuccess={() => {
                                    console.log(
                                      `Settle action for LP position ${position.positionId} initiated. Consider a data refetch.`
                                    );
                                  }}
                                />
                              );
                            }
                            // Render Sell button only if not on Market Page and other conditions met
                            // On the profile page (isMarketPage === false), the sell button should be shown.
                            // On a specific market page (isMarketPage === true), it should not be shown.
                            if (!isMarketPage) {
                              // !isMarketPage means it's a Profile page OR a Market Group page
                              return (
                                <Link href={positionUrl} passHref>
                                  <Button size="xs" variant="outline">
                                    Sell
                                  </Button>
                                </Link>
                              );
                            }
                            return null;
                          }
                          return null;
                        })()}
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
