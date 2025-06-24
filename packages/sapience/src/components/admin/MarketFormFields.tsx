'use client';

import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import { useState, useEffect } from 'react';

import { TICK_SPACING } from '../../lib/constants/numbers';
import { priceToTick } from '../../lib/utils/tickUtils';
import {
  priceToSqrtPriceX96,
  sqrtPriceX96ToPriceD18,
} from '../../lib/utils/util';
import DateTimePicker from '../shared/DateTimePicker';

export interface MarketInput {
  id: number;
  marketQuestion: string;
  optionName?: string;
  startTime: string;
  endTime: string;
  startingPrice: string;
  lowTickPrice: string;
  highTickPrice: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  claimStatement: string;
  rules?: string;
}

interface MarketFormFieldsProps {
  market: MarketInput;
  onMarketChange: (field: keyof MarketInput, value: string) => void;
  marketIndex?: number;
  isCompact?: boolean;
}

const MarketFormFields = ({
  market,
  onMarketChange,
  marketIndex,
  isCompact,
}: MarketFormFieldsProps) => {
  const [error, setError] = useState<string | null>(null);
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [maxPriceError, setMaxPriceError] = useState<string | null>(null);
  const [isMinPriceFocused, setIsMinPriceFocused] = useState(false);
  const [isMaxPriceFocused, setIsMaxPriceFocused] = useState(false);

  // Clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Clear errors after 5 seconds
  useEffect(() => {
    if (!minPriceError && !maxPriceError) return;
    const timer = setTimeout(() => {
      setMinPriceError(null);
      setMaxPriceError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [minPriceError, maxPriceError]);

  const fieldId = (fieldName: string) =>
    marketIndex !== undefined ? `${fieldName}-${marketIndex}` : fieldName;

  // Parse string timestamps to numbers safely
  const parseTimestamp = (value: string): number => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : parsed;
  };

  const startTimestamp = parseTimestamp(market.startTime);
  const endTimestamp = parseTimestamp(market.endTime);

  // Get the time part as a string for a given timestamp
  const getTimePart = (timestamp: number) => {
    const d = new Date(timestamp * 1000);
    return d.toISOString().slice(11, 16); // 'HH:mm'
  };

  // Centralized logic for updating start/end times
  const handleDateTimeChange = (
    field: 'startTime' | 'endTime',
    timestamp: number
  ) => {
    if (field === 'startTime') {
      onMarketChange('startTime', timestamp.toString());
    } else if (field === 'endTime') {
      onMarketChange('endTime', timestamp.toString());
    }
  };

  // Handle price change and keep sqrtPriceX96 in sync
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('startingPrice', price);
    onMarketChange(
      'startingSqrtPriceX96',
      priceToSqrtPriceX96(Number(price)).toString()
    );
  };

  // Handle min price change and convert to tick
  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('lowTickPrice', price.toString());
    if (!isMinPriceFocused) {
      const numPrice = Number(price);
      onMarketChange(
        'baseAssetMinPriceTick',
        priceToTick(numPrice, TICK_SPACING).toString()
      );
    }
  };

  const handleMinPriceBlur = () => {
    setIsMinPriceFocused(false);
    const numPrice = Number(market.lowTickPrice);
    const maxPrice = Number(market.highTickPrice);

    if (numPrice <= 0) {
      const uniswapMinPrice = 0.00009908435194807992;
      onMarketChange('lowTickPrice', uniswapMinPrice.toString());
      onMarketChange(
        'baseAssetMinPriceTick',
        priceToTick(uniswapMinPrice, TICK_SPACING).toString()
      );
      setMinPriceError(
        'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992'
      );
      return;
    }

    if (numPrice > maxPrice) {
      onMarketChange('lowTickPrice', maxPrice.toString());
      onMarketChange(
        'baseAssetMinPriceTick',
        priceToTick(maxPrice, TICK_SPACING).toString()
      );
      setMinPriceError(
        'Min price cannot be greater than max price. Set to max price value.'
      );
      return;
    }

    onMarketChange(
      'baseAssetMinPriceTick',
      priceToTick(numPrice, TICK_SPACING).toString()
    );
    setMinPriceError(null);
  };

  // Handle max price change and convert to tick
  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('highTickPrice', price.toString());
    if (!isMaxPriceFocused) {
      const numPrice = Number(price);
      onMarketChange(
        'baseAssetMaxPriceTick',
        priceToTick(numPrice, TICK_SPACING).toString()
      );
    }
  };

  const handleMaxPriceBlur = () => {
    setIsMaxPriceFocused(false);
    const numPrice = Number(market.highTickPrice);
    const minPrice = Number(market.lowTickPrice);

    if (numPrice <= 0) {
      const uniswapMinPrice = 0.00009908435194807992;
      onMarketChange('highTickPrice', uniswapMinPrice.toString());
      onMarketChange(
        'baseAssetMaxPriceTick',
        priceToTick(uniswapMinPrice, TICK_SPACING).toString()
      );
      setMaxPriceError(
        'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992'
      );
      return;
    }

    if (numPrice < minPrice) {
      onMarketChange('highTickPrice', minPrice.toString());
      onMarketChange(
        'baseAssetMaxPriceTick',
        priceToTick(minPrice, TICK_SPACING).toString()
      );
      setMaxPriceError(
        'Max price cannot be less than min price. Set to min price value.'
      );
      return;
    }

    onMarketChange(
      'baseAssetMaxPriceTick',
      priceToTick(numPrice, TICK_SPACING).toString()
    );
    setMaxPriceError(null);
  };

  console.log(market);
  return (
    <div className="space-y-4 py-4">
      {error && <div className="text-sm text-red-500 mb-2">{error}</div>}

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

      {/* Market Question & Option Name */}
      <div
        className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'md:grid-cols-2 gap-6'}`}
      >
        <div>
          <Label htmlFor={fieldId('startTime')}>Start Time</Label>
          <DateTimePicker
            id={fieldId('startTime')}
            value={startTimestamp}
            onChange={(timestamp: number) =>
              handleDateTimeChange('startTime', timestamp)
            }
            min={0}
            max={endTimestamp}
            timePart={getTimePart(startTimestamp)}
          />
        </div>
        <div>
          <Label htmlFor={fieldId('endTime')}>End Time</Label>
          <DateTimePicker
            id={fieldId('endTime')}
            value={endTimestamp}
            onChange={(timestamp: number) =>
              handleDateTimeChange('endTime', timestamp)
            }
            min={startTimestamp}
            timePart={getTimePart(endTimestamp)}
          />
        </div>
      </div>

      {/* Pricing Params */}
      <div
        className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'md:grid-cols-3 gap-4'}`}
      >
        <div>
          <Label htmlFor={fieldId('startingPrice')}>Starting Price</Label>
          <Input
            id={fieldId('startingPrice')}
            type="number"
            value={market.startingPrice || ''}
            onChange={handlePriceChange}
            placeholder="e.g., 1.23"
            required
            inputMode="decimal"
            step="any"
            min="0"
          />
          <div className="text-xs text-gray-400 mt-1 w-full text-center">
            computed sqrtPriceX96:{' '}
            {priceToSqrtPriceX96(Number(market.startingPrice)).toString()}
            <br />
            computed inverse:{' '}
            {(
              Number(
                sqrtPriceX96ToPriceD18(
                  priceToSqrtPriceX96(Number(market.startingPrice))
                )
              ) /
              10 ** 18
            ).toString()}
          </div>
        </div>
        <div>
          <Label htmlFor={fieldId('lowTickPrice')}>Min Price</Label>
          <Input
            id={fieldId('lowTickPrice')}
            type="number"
            value={market.lowTickPrice}
            onChange={handleMinPriceChange}
            onFocus={() => setIsMinPriceFocused(true)}
            onBlur={handleMinPriceBlur}
            placeholder="e.g., 0.5"
            required
            inputMode="decimal"
            step="any"
            min="0"
          />
          <div className="text-xs text-gray-400 mt-1 w-full text-center">
            tick: {market.baseAssetMinPriceTick}
          </div>
          {minPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {minPriceError}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor={fieldId('highTickPrice')}>Max Price</Label>
          <Input
            id={fieldId('highTickPrice')}
            type="number"
            value={market.highTickPrice}
            onChange={handleMaxPriceChange}
            onFocus={() => setIsMaxPriceFocused(true)}
            onBlur={handleMaxPriceBlur}
            placeholder="e.g., 2.0"
            required
            inputMode="decimal"
            step="any"
            min="0"
          />
          <div className="text-xs text-gray-400 mt-1 w-full text-center">
            tick: {market.baseAssetMaxPriceTick}
          </div>
          {maxPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {maxPriceError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketFormFields;
