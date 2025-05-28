'use client';

import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';

// Define MarketInput here. This will be used by AddMarketDialog and CombinedMarketDialog.
export interface MarketInput {
  id: number;
  marketQuestion: string;
  optionName?: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  claimStatement: string;
  rules?: string;
}

interface MarketFormFieldsProps {
  market: MarketInput;
  onMarketChange: (field: keyof MarketInput, value: string) => void;
  marketIndex?: number; // Optional, if you need to distinguish fields for multiple markets
  isCompact?: boolean; // Optional, for styling variations
}

const MarketFormFields: React.FC<MarketFormFieldsProps> = ({
  market,
  onMarketChange,
  marketIndex,
  isCompact,
}) => {
  const fieldId = (fieldName: string) =>
    marketIndex !== undefined ? `${fieldName}-${marketIndex}` : fieldName;

  return (
    <div className={`space-y-4 ${isCompact ? 'p-0' : 'p-4'}`}>
      {/* Market Question & Option Name */}
      <div
        className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'md:grid-cols-2 gap-4'}`}
      >
        <div>
          <Label htmlFor={fieldId('marketQuestion')}>Market Question</Label>
          <Input
            id={fieldId('marketQuestion')}
            type="text"
            value={market.marketQuestion}
            onChange={(e) => onMarketChange('marketQuestion', e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor={fieldId('optionName')}>Option Name (Optional)</Label>
          <Input
            id={fieldId('optionName')}
            type="text"
            value={market.optionName || ''}
            onChange={(e) => onMarketChange('optionName', e.target.value)}
          />
        </div>
      </div>

      {/* Claim Statement */}
      <div>
        <Label htmlFor={fieldId('claimStatement')}>Claim Statement</Label>
        <Input
          id={fieldId('claimStatement')}
          type="text"
          value={market.claimStatement}
          onChange={(e) => onMarketChange('claimStatement', e.target.value)}
          placeholder="e.g. The average cost of gas in June 2025..."
          required
        />
        {!isCompact && (
          <p className="text-sm text-muted-foreground mt-1">
            This will be followed by the settlement value in UMA.
          </p>
        )}
      </div>

      {/* Rules */}
      <div>
        <Label htmlFor={fieldId('rules')}>Rules (Optional)</Label>
        <textarea
          id={fieldId('rules')}
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={market.rules || ''}
          onChange={(e) => onMarketChange('rules', e.target.value)}
          placeholder="Enter any specific rules or conditions for this market..."
        />
      </div>

      {/* Start Time & End Time */}
      <div
        className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'md:grid-cols-2 gap-4'}`}
      >
        <div>
          <Label htmlFor={fieldId('startTime')}>
            Start Time (Unix Timestamp)
          </Label>
          <Input
            id={fieldId('startTime')}
            type="number"
            value={market.startTime}
            onChange={(e) => onMarketChange('startTime', e.target.value)}
            required
            min="0"
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor={fieldId('endTime')}>End Time (Unix Timestamp)</Label>
          <Input
            id={fieldId('endTime')}
            type="number"
            value={market.endTime}
            onChange={(e) => onMarketChange('endTime', e.target.value)}
            required
            min="0"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Pricing Params */}
      <div
        className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'md:grid-cols-3 gap-4'}`}
      >
        <div>
          <Label htmlFor={fieldId('startingSqrtPriceX96')}>
            Starting Sqrt Price X96
          </Label>
          <Input
            id={fieldId('startingSqrtPriceX96')}
            type="text"
            value={market.startingSqrtPriceX96}
            onChange={(e) =>
              onMarketChange('startingSqrtPriceX96', e.target.value)
            }
            placeholder="e.g., 79228162514..."
            required
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor={fieldId('baseAssetMinPriceTick')}>
            Min Price Tick
          </Label>
          <Input
            id={fieldId('baseAssetMinPriceTick')}
            type="number"
            value={market.baseAssetMinPriceTick}
            onChange={(e) =>
              onMarketChange('baseAssetMinPriceTick', e.target.value)
            }
            placeholder="e.g., -887220"
            required
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor={fieldId('baseAssetMaxPriceTick')}>
            Max Price Tick
          </Label>
          <Input
            id={fieldId('baseAssetMaxPriceTick')}
            type="number"
            value={market.baseAssetMaxPriceTick}
            onChange={(e) =>
              onMarketChange('baseAssetMaxPriceTick', e.target.value)
            }
            placeholder="e.g., 887220"
            required
            inputMode="numeric"
          />
        </div>
      </div>
    </div>
  );
};

export default MarketFormFields;
