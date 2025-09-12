import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

import type { PositionType } from '@sapience/ui/types';
import { InfoIcon } from 'lucide-react';
import Link from 'next/link';
import SettlePositionButton from '../markets/SettlePositionButton';
import SellPositionDialog from '../markets/SellPositionDialog';
import SharePositionDialog from '../markets/SharePositionDialog';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import {
  calculateEffectiveEntryPrice,
  getChainShortName,
} from '~/lib/utils/util';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';

interface TraderPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
  showHeader?: boolean;
}

function MaxPayoutCell({ position }: { position: PositionType }) {
  const baseTokenName = position.market?.marketGroup?.baseTokenName;
  const collateralSymbol = position.market?.marketGroup?.collateralSymbol;

  if (baseTokenName === 'Yes') {
    const baseTokenBI = BigInt(position.baseToken || '0');
    const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
    const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
    const value = Number(formatEther(netPositionBI)); // Used for determining sign

    let maxPayoutAmountBI: bigint;
    if (value >= 0) {
      maxPayoutAmountBI = baseTokenBI;
    } else {
      maxPayoutAmountBI = borrowedBaseTokenBI;
    }
    const displayAmount = Number(formatEther(maxPayoutAmountBI));
    // Removed redundant isNaN check

    return (
      <>
        <NumberDisplay value={displayAmount} /> {collateralSymbol}
      </>
    );
  }
  return <span className="text-muted-foreground">N/A</span>;
}

function PositionValueCell({ position }: { position: PositionType }) {
  const { transactions } = position;
  const marketId = position.market?.marketId;
  const marketGroup = position.market?.marketGroup;
  const address = marketGroup?.address || '';
  const chainId = marketGroup?.chainId || 0;
  const baseTokenName = marketGroup?.baseTokenName;
  const collateralSymbol = marketGroup?.collateralSymbol;

  // --- Fetch Current Market Price ---
  const { data: currentMarketPriceRaw, isLoading: priceLoading } =
    useMarketPrice(address, chainId, marketId);

  // Default to 0 if undefined after loading, handling the linter error
  const currentMarketPrice = currentMarketPriceRaw ?? 0;

  const baseTokenAmount = Number(
    formatEther(BigInt(position.baseToken || '0'))
  );
  const borrowedBaseTokenAmount = Number(
    formatEther(BigInt(position.borrowedBaseToken || '0'))
  );

  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;

  // --- Calculate Effective Entry Price ---
  const entryPrice = calculateEffectiveEntryPrice(transactions || [], isLong);

  // --- Calculate Position Size, Value, PnL ---
  let positionSize = 0;
  let currentPositionValue = 0;
  let costBasis = 0; // The value at entry (note: this is different from wager for PnL%)

  if (baseTokenName === 'Yes') {
    // Yes/No Market
    if (isLong) {
      // Long YES
      positionSize = baseTokenAmount;
      currentPositionValue = positionSize * currentMarketPrice;
      costBasis = positionSize * entryPrice;
    } else {
      // Short YES (Long NO)
      positionSize = borrowedBaseTokenAmount;
      currentPositionValue = positionSize * (1 - currentMarketPrice);
      costBasis = positionSize * (1 - entryPrice);
    }
  } else if (isLong) {
    // Linear or other Market Types - Long Position
    positionSize = baseTokenAmount;
    currentPositionValue = positionSize * currentMarketPrice;
    costBasis = positionSize * entryPrice;
  } else {
    // Linear or other Market Types - Short Position
    positionSize = borrowedBaseTokenAmount;
    const pnlPerUnit = entryPrice - currentMarketPrice;
    const totalPnl = positionSize * pnlPerUnit;
    costBasis = positionSize * entryPrice;
    currentPositionValue = costBasis + totalPnl;
  }

  // --- PnL Calculation based on Wager (position.collateral) ---
  const wagerAmount = Number(formatEther(BigInt(position.collateral || '0')));

  // 'pnl' is the profit or loss amount relative to the initial wager
  const pnl = currentPositionValue - wagerAmount;
  // Calculate PnL percentage relative to the wagerAmount
  const pnlPercentage = wagerAmount !== 0 ? (pnl / wagerAmount) * 100 : 0;

  // --- Per-share values (Avg -> Current) for subtitle under Position Value ---
  const avgPricePerToken = positionSize !== 0 ? wagerAmount / positionSize : 0;
  const currentPricePerToken =
    positionSize !== 0 ? currentPositionValue / positionSize : 0;

  // Display loading state or handle potential errors
  if (priceLoading) {
    return (
      <span className="text-muted-foreground text-xs">Loading price...</span>
    );
  }

  return (
    <div>
      <div className="whitespace-nowrap">
        <NumberDisplay value={currentPositionValue} /> {collateralSymbol}{' '}
        {/* A positive pnl means a gain (value > wager), so green. A negative pnl means a loss. */}
        <small className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
          ({pnlPercentage.toFixed(2)}%)
        </small>
      </div>
      <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
        Share Value: <NumberDisplay value={avgPricePerToken} /> →{' '}
        <NumberDisplay value={currentPricePerToken} /> {collateralSymbol}
      </div>
    </div>
  );
}

export default function TraderPositionsTable({
  positions,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
  showHeader = true,
}: TraderPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId; // True for a specific market page (with marketId)
  const isProfilePageContext = !parentMarketAddress && !parentChainId; // True if on profile page context

  if (!positions || positions.length === 0) {
    return <EmptyTabState message="No trades found" />;
  }

  const validPositions = positions.filter(
    (p) => p && p.market && p.id && !p.isLP
  );

  if (validPositions.length === 0) {
    return <EmptyTabState message="No trades found" />;
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

  // Sort newest to oldest by createdAt; fallback to latest transaction.createdAt
  const getPositionCreatedMs = (p: PositionType) => {
    const direct = (p as PositionType & { createdAt?: string }).createdAt;
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
      {showHeader && <h3 className="font-medium mb-4">Trader Positions</h3>}
      <div className="rounded border bg-background dark:bg-muted/50">
        {/* Table Header (desktop) */}
        <div className="hidden md:grid md:[grid-template-columns:repeat(11,minmax(0,1fr))_auto] items-center px-4 py-1 bg-muted/30 text-sm font-medium text-muted-foreground border-b">
          {displayQuestionColumn && (
            <div className="md:col-span-5">Prediction Market</div>
          )}
          <div
            className={
              displayQuestionColumn ? 'md:col-span-3' : 'md:col-span-5'
            }
          >
            Wager
          </div>
          <div
            className={
              (displayQuestionColumn ? 'md:col-span-3' : 'md:col-span-6') +
              ' flex items-center gap-1'
            }
          >
            <span>Current Position Value</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-normal">
                    The position value is approximate due to slippage.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {/* Header actions sizer to align auto-width column with row actions */}
          <div className="md:col-start-12 md:col-span-1 md:justify-self-end">
            <div className="invisible flex gap-3" aria-hidden>
              <Button size="sm" variant="outline">
                Settle
              </Button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
              >
                Share
              </button>
            </div>
          </div>
        </div>
        {sortedPositions.map((position: PositionType) => {
          const isOwner =
            connectedAddress &&
            position.owner &&
            connectedAddress.toLowerCase() === position.owner.toLowerCase();

          if (!position.market) {
            console.warn(
              'Skipping position render due to missing market data:',
              position.positionId
            );
            return null;
          }

          const isClosed = Number(position.collateral) === 0;
          const marketAddress = position.market.marketGroup?.address || '';

          const endTimestamp = position.market?.endTimestamp;
          const isPositionSettled = position.isSettled || false;
          const now = Date.now();
          const isExpired = endTimestamp
            ? Number(endTimestamp) * 1000 < now
            : false;

          return (
            <TraderPositionRow
              key={position.id}
              position={position}
              isOwner={Boolean(isOwner)}
              hasWallet={Boolean(connectedAddress)}
              isClosed={isClosed}
              isExpired={isExpired}
              isMarketPage={Boolean(isMarketPage)}
              isPositionSettled={isPositionSettled}
              marketAddress={marketAddress}
              displayQuestionColumn={Boolean(displayQuestionColumn)}
            />
          );
        })}
      </div>
    </div>
  );
}

type TraderPositionRowProps = {
  position: PositionType;
  isOwner: boolean;
  hasWallet: boolean;
  isClosed: boolean;
  isExpired: boolean;
  isMarketPage: boolean;
  isPositionSettled: boolean;
  marketAddress: string;
  displayQuestionColumn: boolean;
};

function TraderPositionRow({
  position,
  isOwner,
  hasWallet,
  isClosed,
  isExpired,
  isMarketPage,
  isPositionSettled,
  marketAddress,
  displayQuestionColumn,
}: TraderPositionRowProps) {
  return (
    <div className="px-4 py-4 md:py-4 border-b last:border-b-0">
      <div className="flex flex-col gap-3 md:grid md:[grid-template-columns:repeat(11,minmax(0,1fr))_auto] md:items-center">
        {displayQuestionColumn && (
          <div className="md:col-span-5">
            {(() => {
              const chainShortName = position.market?.marketGroup?.chainId
                ? getChainShortName(position.market.marketGroup.chainId)
                : 'unknown';
              const marketAddr = position.market?.marketGroup?.address || '';
              const marketId = position.market?.marketId;
              const question = position.market?.question || 'N/A';
              const baseTokenName = position.market?.marketGroup?.baseTokenName;
              const baseTokenAmount = Number(
                formatEther(BigInt(position.baseToken || '0'))
              );
              const borrowedBaseTokenAmount = Number(
                formatEther(BigInt(position.borrowedBaseToken || '0'))
              );
              const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
              const isLong = netPosition >= 0;
              let positionSize = 0;
              if (baseTokenName === 'Yes') {
                positionSize = isLong
                  ? baseTokenAmount
                  : borrowedBaseTokenAmount;
              } else {
                positionSize = isLong
                  ? baseTokenAmount
                  : borrowedBaseTokenAmount;
              }
              const marketGroup = position.market?.marketGroup;
              const marketClassification = marketGroup
                ? getMarketGroupClassification(marketGroup)
                : MarketGroupClassification.NUMERIC;
              const isYesNo =
                marketClassification === MarketGroupClassification.YES_NO;
              const isNumeric =
                marketClassification === MarketGroupClassification.NUMERIC;
              const sharesLabel = isYesNo
                ? `${isLong ? 'Yes' : 'No'} Shares`
                : 'Shares';

              if (!marketAddr || marketId === undefined)
                return (
                  <div className="space-y-2">
                    <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] flex items-center gap-2">
                      {question}
                    </h2>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Badge
                        variant={isNumeric ? 'default' : 'outline'}
                        className={
                          isYesNo
                            ? isLong
                              ? 'border-green-500/40 bg-green-500/10 text-green-600'
                              : 'border-red-500/40 bg-red-500/10 text-red-600'
                            : ''
                        }
                      >
                        <span className="flex items-center gap-1">
                          <NumberDisplay value={positionSize} /> {sharesLabel}
                        </span>
                      </Badge>
                      <span> #{position.positionId}</span>
                    </div>
                  </div>
                );
              return (
                <div className="space-y-2">
                  <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] flex items-center gap-2">
                    <Link
                      href={`/markets/${chainShortName}:${marketAddr}/${marketId}`}
                      className="group"
                    >
                      <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                        {question}
                      </span>
                    </Link>
                  </h2>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Badge
                      variant={isNumeric ? 'default' : 'outline'}
                      className={
                        isYesNo
                          ? isLong
                            ? 'border-green-500/40 bg-green-500/10 text-green-600'
                            : 'border-red-500/40 bg-red-500/10 text-red-600'
                          : ''
                      }
                    >
                      <span className="flex items-center gap-1">
                        <NumberDisplay value={positionSize} /> {sharesLabel}
                      </span>
                    </Badge>
                    <span>Position #{position.positionId}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {isClosed ? (
          <div className="md:col-span-7 text-center font-medium text-muted-foreground tracking-wider">
            CLOSED
          </div>
        ) : (
          <>
            {/* Removed Position Size cell as it's displayed under the question */}

            <div
              className={
                displayQuestionColumn ? 'md:col-span-3' : 'md:col-span-5'
              }
            >
              <div className="text-xs text-muted-foreground md:hidden">
                Wager
              </div>
              <div>
                <div className="whitespace-nowrap">
                  <NumberDisplay
                    value={Number(
                      formatEther(BigInt(position.collateral || '0'))
                    )}
                  />{' '}
                  {position.market?.marketGroup?.collateralSymbol || 'Unknown'}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
                  To Win: <MaxPayoutCell position={position} />
                </div>
              </div>
            </div>

            <div
              className={
                displayQuestionColumn ? 'md:col-span-3' : 'md:col-span-6'
              }
            >
              <div className="text-xs text-muted-foreground md:hidden">
                Position Value
              </div>
              <PositionValueCell position={position} />
            </div>

            <div className="mt-3 md:mt-0 md:col-span-1 md:col-start-12 md:justify-self-end">
              <div className="flex gap-3 justify-start md:justify-end">
                {/* Exclusively show Settle when expired and not settled; otherwise show Sell (not on market page) */}
                {isExpired && !isPositionSettled ? (
                  isOwner ? (
                    <SettlePositionButton
                      positionId={position.positionId.toString()}
                      marketAddress={marketAddress}
                      chainId={position.market?.marketGroup?.chainId || 0}
                      isMarketSettled={position.market?.settled || false}
                      onSuccess={() => {
                        console.log(
                          `Settle action for position ${position.positionId} initiated. Consider implementing a data refetch mechanism.`
                        );
                      }}
                    />
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Settle
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-[220px]">
                            {hasWallet
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
                    <SellPositionDialog
                      position={position}
                      marketAddress={marketAddress}
                      chainId={position.market?.marketGroup?.chainId || 0}
                      onSuccess={() => {
                        console.log(
                          `Close action for position ${position.positionId} sent.`
                        );
                      }}
                    />
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Sell
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-[220px]">
                            {!hasWallet
                              ? 'Connect your wallet to sell this position.'
                              : isClosed
                                ? 'This position is already closed.'
                                : 'You can only sell from the account that owns this position.'}
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
          </>
        )}
      </div>
    </div>
  );
}
