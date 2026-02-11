import { formatEther } from 'viem';

/**
 * Calculate PnL for a settled position from the viewer's perspective.
 *
 * @returns `{ pnl, roi }` where pnl is in ether units and roi is a percentage,
 *          or `null` if the position is not settled or data is missing.
 */
export function calculatePositionPnL({
  isSettled,
  predictorWon,
  isCounterparty,
  predictorCollateral,
  counterpartyCollateral,
  totalCollateral,
}: {
  isSettled: boolean;
  predictorWon: boolean | null | undefined;
  isCounterparty: boolean;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral?: string | null;
}): { pnl: number; roi: number } | null {
  if (!isSettled || predictorWon === null || predictorWon === undefined)
    return null;
  if (!predictorCollateral || !counterpartyCollateral || !totalCollateral)
    return null;

  try {
    const viewerWon = isCounterparty ? !predictorWon : predictorWon;
    const positionSizeWei = BigInt(
      isCounterparty ? counterpartyCollateral : predictorCollateral
    );
    const totalWei = BigInt(totalCollateral);
    const positionSize = Number(formatEther(positionSizeWei));
    const total = Number(formatEther(totalWei));

    const pnl = viewerWon ? total - positionSize : -positionSize;
    const roi = positionSize > 0 ? (pnl / positionSize) * 100 : 0;

    return { pnl, roi };
  } catch {
    return null;
  }
}

/**
 * Calculate PnL as a raw wei string (used by PositionsTable for per-row data).
 */
export function calculatePositionPnLWei({
  predictorWon,
  isCounterparty,
  predictorCollateral,
  counterpartyCollateral,
  totalCollateral,
}: {
  predictorWon: boolean | null | undefined;
  isCounterparty: boolean;
  predictorCollateral: string;
  counterpartyCollateral: string;
  totalCollateral: string;
}): string {
  try {
    const viewerWon = isCounterparty ? !predictorWon : predictorWon;
    const positionSizeWei = BigInt(
      isCounterparty ? counterpartyCollateral : predictorCollateral
    );
    const totalWei = BigInt(totalCollateral);

    if (viewerWon) return (totalWei - positionSizeWei).toString();
    return (-positionSizeWei).toString();
  } catch {
    return '0';
  }
}
