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
import { Info } from 'lucide-react';
import Link from 'next/link';
import { formatEther } from 'viem';

import NumberDisplay from '~/components/shared/NumberDisplay';
import type { Position } from '~/lib/interfaces/interfaces';
import { tickToPrice, getChainShortName } from '~/lib/utils/util';

interface LpPositionsTableProps {
  positions: Position[];
}

// Helper component for Market Cell (similar to app package but simpler for now)
function MarketCell({ position }: { position: Position }) {
  return position.market.question;
}

// Helper component for Collateral Cell
function CollateralCell({ position }: { position: Position }) {
  const decimals = position.market.marketGroup?.collateralDecimals || 18; // Default to 18 if not provided
  const symbol = position.market.marketGroup?.collateralSymbol || 'Tokens';
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
    <span className="flex items-center gap-1">
      Unrealized PnL{' '}
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

export default function LpPositionsTable({ positions }: LpPositionsTableProps) {
  if (!positions || positions.length === 0) {
    return null;
  }

  const validPositions = (positions as Position[]).filter(
    (p) =>
      p &&
      p.market &&
      p.market.marketGroup &&
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

  return (
    <div>
      <h3 className="font-medium mb-4">Liquidity Positions</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
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
            {validPositions.map((position: Position) => {
              const { marketGroup } = position.market;
              const baseUnit = `v${marketGroup?.baseTokenName || 'Base'}`;
              const quoteUnit = `v${marketGroup?.collateralSymbol || 'Quote'}`;
              const priceUnit = `${marketGroup?.collateralSymbol || 'Quote'}/${marketGroup?.baseTokenName || 'Base'}`;
              const collateralDecimals = marketGroup?.collateralDecimals || 18; // Default needed for PnLCell/direct render
              const collateralSymbol =
                marketGroup?.collateralSymbol || 'Tokens'; // Default needed for PnLCell/direct render

              const isClosed =
                position.lpBaseToken === '0' && position.lpQuoteToken === '0';

              const chainShortName = marketGroup?.chainId
                ? getChainShortName(marketGroup.chainId)
                : 'unknown';
              const positionUrl = `/positions/${chainShortName}:${marketGroup?.address}/${position.market.marketId}?positionId=${position.positionId}`;

              // Prepare PnL rendering - use direct value from position object
              let pnlContent;
              if (
                position.totalPnL !== undefined &&
                position.totalPnL !== null
              ) {
                // Render PnL directly from the position object
                const pnlValue =
                  Number(position.totalPnL) / 10 ** collateralDecimals;
                pnlContent = (
                  <div className="flex items-center gap-1">
                    <NumberDisplay value={pnlValue} />
                    <span className="text-muted-foreground text-sm">
                      {collateralSymbol}
                    </span>
                  </div>
                );
              } else {
                // PnL data is missing or null on the position object
                pnlContent = (
                  <span className="text-xs text-muted-foreground">N/A</span>
                );
              }

              return (
                <TableRow key={position.id}>
                  <TableCell>
                    <MarketCell position={position} />
                  </TableCell>
                  {isClosed ? (
                    <TableCell
                      colSpan={7} // Adjusted colSpan to 7 to include the "More Info" column
                      className="text-center font-medium text-muted-foreground"
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
                      <TableCell>
                        {/* Render the prepared PnL content */}
                        {pnlContent}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={positionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm">More Info</Button>
                        </Link>
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
