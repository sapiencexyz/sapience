import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
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

export default function LpPositionsTable({ positions }: LpPositionsTableProps) {
  if (!positions || positions.length === 0) {
    return null;
  }

  const validPositions = positions.filter(
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
              <TableHead /> {/* Header for More Info */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {validPositions.map((position: Position) => {
              const { marketGroup } = position.market;
              const baseUnit = `v${marketGroup?.baseTokenName || 'Base'}`;
              const quoteUnit = `v${marketGroup?.collateralSymbol || 'Quote'}`;
              const priceUnit = `${marketGroup?.collateralSymbol || 'Quote'}/${marketGroup?.baseTokenName || 'Base'}`;

              const isClosed =
                position.lpBaseToken === '0' && position.lpQuoteToken === '0';

              const chainShortName = marketGroup?.chainId
                ? getChainShortName(marketGroup.chainId)
                : 'unknown';
              const positionUrl = `/positions/${chainShortName}:${marketGroup?.address}/${position.market.marketId}?positionId=${position.positionId}`;

              return (
                <TableRow key={position.id}>
                  <TableCell>
                    <MarketCell position={position} />
                  </TableCell>
                  {isClosed ? (
                    <TableCell
                      colSpan={5} // Spans Collateral, VBase, VQuote, Low, High
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
                    </>
                  )}
                  <TableCell className="text-right">
                    <Link
                      href={positionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm">More Info</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
