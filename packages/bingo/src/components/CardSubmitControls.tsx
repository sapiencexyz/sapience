import { fmtUnits } from '../lib/format/balance';
import type { PoolResponse } from '../lib/backendApi';

/**
 * Pre-submit price + sponsorship controls for an unsubmitted card: the card
 * price field (or the sponsored "first card on us" note) plus the Quick Pick /
 * Submit actions. Presentational — all state/derivation stays in the screen and
 * is passed in, so CardDetailScreen owns composition, not display rules.
 */
export default function CardSubmitControls(props: {
  pool: PoolResponse | null;
  /** House-funds this card — hides the price input, shows the sponsored note. */
  sponsored: boolean;
  sponsoredPriceWei: bigint | null;
  priceInput: string;
  onPriceInput: (value: string) => void;
  /** Validated entered price (null = invalid/empty). */
  enteredPriceWei: bigint | null;
  /** Price actually submitted (sponsored amount or entered). */
  effectivePriceWei: bigint | null;
  availableWei: bigint | null | undefined;
  insufficientBalance: boolean;
  actionBusy: boolean;
  isActive: boolean;
  allCellsPicked: boolean;
  onQuickPick: () => void;
  onSubmit: () => void;
}) {
  const {
    pool,
    sponsored,
    sponsoredPriceWei,
    priceInput,
    onPriceInput,
    enteredPriceWei,
    effectivePriceWei,
    availableWei,
    insufficientBalance,
    actionBusy,
    isActive,
    allCellsPicked,
    onQuickPick,
    onSubmit,
  } = props;

  return (
    <>
      {sponsored ? (
        <div className="field price-field">
          <div className="price-field-labels">
            <label className="label">Card price (USDe)</label>
            <span className="label muted">Sponsored 🎟️</span>
          </div>
          <p className="muted small">
            Your first card is on us — {fmtUnits(sponsoredPriceWei ?? 0n)} USDe
            sponsored. No deposit needed.
          </p>
        </div>
      ) : (
        <div className="field price-field">
          <div className="price-field-labels">
            <label className="label" htmlFor="card-price">
              Card price (USDe)
            </label>
            {availableWei != null && (
              <span className="label muted">
                Available: {fmtUnits(availableWei)} USDe
              </span>
            )}
          </div>
          <input
            id="card-price"
            className="admin-input"
            inputMode="decimal"
            placeholder={pool ? fmtUnits(BigInt(pool.minCardPriceWei)) : '10'}
            value={priceInput}
            onChange={(e) => onPriceInput(e.target.value)}
            disabled={actionBusy}
          />
          {priceInput.trim() && enteredPriceWei == null && (
            <p className="muted small">
              Must be a multiple of 10 wei
              {pool
                ? ` and at least ${fmtUnits(BigInt(pool.minCardPriceWei))}`
                : ''}
              .
            </p>
          )}
          {insufficientBalance && (
            <p className="error small">
              Not enough USDe — you have {fmtUnits(availableWei ?? undefined)}{' '}
              available.
            </p>
          )}
        </div>
      )}
      <div className="pick-actions">
        <button
          type="button"
          className="quick-pick block"
          disabled={actionBusy}
          onClick={onQuickPick}
        >
          Quick Pick
        </button>
        <button
          type="button"
          className="primary block"
          disabled={
            actionBusy ||
            !isActive ||
            !allCellsPicked ||
            effectivePriceWei == null ||
            insufficientBalance
          }
          onClick={onSubmit}
        >
          {actionBusy
            ? 'Submitting…'
            : !allCellsPicked
              ? 'Make All Picks'
              : sponsored
                ? 'Mint with sponsorship balance'
                : 'Submit Picks'}
        </button>
      </div>
    </>
  );
}
