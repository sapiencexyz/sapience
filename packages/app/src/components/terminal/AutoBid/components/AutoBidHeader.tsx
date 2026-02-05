import type React from 'react';
import { Pencil } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';

type AutoBidHeaderProps = {
  allowanceValue: number;
  balanceValue: number;
  collateralSymbol: string;
  onOpenApproval: () => void;
};

const AutoBidHeader: React.FC<AutoBidHeaderProps> = ({
  allowanceValue,
  balanceValue,
  collateralSymbol,
  onOpenApproval,
}) => {
  const isUnlimitedAllowance = !Number.isFinite(allowanceValue);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {/* Left: Approved Spend */}
        <div className="px-1">
          <div className="text-xs font-medium text-muted-foreground">
            Approved Spend
          </div>
          <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
            {isUnlimitedAllowance ? (
              <span>&gt;1,000,000,000 {collateralSymbol}</span>
            ) : (
              <NumberDisplay
                value={allowanceValue}
                appendedText={collateralSymbol}
                decimals={2}
              />
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center"
              aria-label="Edit approved spend"
              onClick={onOpenApproval}
            >
              <Pencil className="h-3 w-3 text-accent-gold" />
            </button>
          </div>
        </div>

        {/* Right: Account Balance */}
        <div className="px-1">
          <div className="text-xs font-medium text-muted-foreground">
            Account Balance
          </div>
          <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
            <NumberDisplay
              value={balanceValue}
              appendedText={collateralSymbol}
              decimals={2}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoBidHeader;
