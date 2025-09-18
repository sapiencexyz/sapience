'use client';

import { Input, Label } from '@sapience/ui';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import { Switch } from '@sapience/ui/components/ui/switch';
import { useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';

import { TICK_SPACING } from '../../lib/constants/numbers';
import { priceToTick } from '../../lib/utils/tickUtils';
import {
  priceToSqrtPriceX96,
  sqrtPriceX96ToPriceD18,
} from '../../lib/utils/util';
import DateTimePicker from '../shared/DateTimePicker';

// Copy UI types removed from this component

export interface MarketInput {
  id: number;
  marketQuestion: string;
  shortName?: string;
  optionName?: string;
  startTime: string;
  endTime: string;
  startingPrice: string;
  lowTickPrice: string;
  highTickPrice: string;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  claimStatementYesOrNumeric: string;
  claimStatementNo: string;
  public: boolean;
  similarMarkets?: string[];
}

const STARTING_PRICE_MIN_ERROR =
  'Starting price cannot be less than min price. Set to min price value.';
const STARTING_PRICE_MAX_ERROR =
  'Starting price cannot be greater than max price. Set to max price value.';

interface MarketFormFieldsProps {
  market: MarketInput;
  onMarketChange: (
    field: keyof MarketInput,
    value: string | boolean | string[]
  ) => void;
  marketIndex?: number;
  disabledFields?: Partial<
    Record<
      | keyof MarketInput
      | 'baseAssetMinPriceTick'
      | 'baseAssetMaxPriceTick'
      | 'startingSqrtPriceX96',
      boolean
    >
  >;
}

const MarketFormFields = ({
  market,
  onMarketChange,
  marketIndex,
  disabledFields,
}: MarketFormFieldsProps) => {
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [maxPriceError, setMaxPriceError] = useState<string | null>(null);
  const [startingPriceError, setStartingPriceError] = useState<string | null>(
    null
  );
  const [isMinPriceFocused, setIsMinPriceFocused] = useState(false);
  const [isMaxPriceFocused, setIsMaxPriceFocused] = useState(false);
  const [isStartingPriceFocused, setIsStartingPriceFocused] = useState(false);

  // Constants for duplicate strings
  const UNISWAP_MIN_PRICE = '0.00009908435194807992';
  const UNISWAP_MIN_PRICE_MESSAGE =
    'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992';

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
    if (!value || value.trim() === '') {
      return 0; // Return 0 for empty values
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : parsed;
  };

  const startTimestamp = parseTimestamp(market.startTime);
  const endTimestamp = parseTimestamp(market.endTime);
  const isPricingDisabled = Boolean(
    disabledFields?.baseAssetMinPriceTick ||
      disabledFields?.baseAssetMaxPriceTick ||
      disabledFields?.startingSqrtPriceX96
  );

  // Get the time part as a string for a given timestamp
  const getTimePart = (timestamp: number) => {
    if (timestamp === 0) return ''; // Return empty string for unset timestamps
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

  // Decode on-chain hex claim statements for display when fields are disabled
  const decodeClaimStatement = (claimStatement: string): string => {
    if (!claimStatement) return '';
    if (claimStatement.startsWith('0x') && claimStatement.length > 2) {
      try {
        const hexString = claimStatement.slice(2);
        const bytes = new Uint8Array(
          hexString.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return claimStatement;
      }
    }
    return claimStatement;
  };

  const displayClaimYesOrNumeric = disabledFields?.claimStatementYesOrNumeric
    ? decodeClaimStatement(market.claimStatementYesOrNumeric)
    : market.claimStatementYesOrNumeric;

  const displayClaimNo = disabledFields?.claimStatementNo
    ? decodeClaimStatement(market.claimStatementNo)
    : market.claimStatementNo;

  // Handle price change and keep sqrtPriceX96 in sync
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('startingPrice', price);

    // Only validate when not focused
    if (!isStartingPriceFocused) {
      const numPrice = Number(price);
      const minPrice = Number(market.lowTickPrice);
      const maxPrice = Number(market.highTickPrice);

      // Validate starting price is between min and max
      if (numPrice > 0 && minPrice > 0 && maxPrice > 0) {
        if (numPrice < minPrice) {
          // Set starting price to min price
          onMarketChange('startingPrice', minPrice.toString());
          onMarketChange(
            'startingSqrtPriceX96',
            priceToSqrtPriceX96(minPrice).toString()
          );
          setStartingPriceError(STARTING_PRICE_MIN_ERROR);
        } else if (numPrice > maxPrice) {
          // Set starting price to max price
          onMarketChange('startingPrice', maxPrice.toString());
          onMarketChange(
            'startingSqrtPriceX96',
            priceToSqrtPriceX96(maxPrice).toString()
          );
          setStartingPriceError(STARTING_PRICE_MAX_ERROR);
        } else {
          setStartingPriceError(null);
          onMarketChange(
            'startingSqrtPriceX96',
            priceToSqrtPriceX96(Number(price)).toString()
          );
        }
      } else {
        setStartingPriceError(null);
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(Number(price)).toString()
        );
      }
    } else {
      // When focused, just update sqrtPriceX96 without validation
      onMarketChange(
        'startingSqrtPriceX96',
        priceToSqrtPriceX96(Number(price)).toString()
      );
    }
  };

  // Handle min price change and convert to tick
  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('lowTickPrice', price.toString());

    // Only validate when not focused (e.g., arrow keys)
    if (!isMinPriceFocused) {
      const numPrice = Number(price);
      const maxPrice = Number(market.highTickPrice);
      const currentStartingPrice = Number(market.startingPrice);

      // Check if min price exceeds max price
      if (numPrice > 0 && maxPrice > 0 && numPrice > maxPrice) {
        // Set min price to max price
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

      // Always update tick
      if (numPrice > 0) {
        onMarketChange(
          'baseAssetMinPriceTick',
          priceToTick(numPrice, TICK_SPACING).toString()
        );
      }
      setMinPriceError(null);

      // Check if starting price is below the new min price
      if (
        currentStartingPrice > 0 &&
        numPrice > 0 &&
        currentStartingPrice < numPrice
      ) {
        // Starting price is below the new min price, set it to min price
        onMarketChange('startingPrice', numPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(numPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MIN_ERROR);
      } else {
        setStartingPriceError(null);
      }
    }
  };

  const handleMinPriceBlur = () => {
    setIsMinPriceFocused(false);
    const numPrice = Number(market.lowTickPrice);
    const maxPrice = Number(market.highTickPrice);

    if (numPrice <= 0) {
      onMarketChange('lowTickPrice', UNISWAP_MIN_PRICE);
      onMarketChange(
        'baseAssetMinPriceTick',
        priceToTick(Number(UNISWAP_MIN_PRICE), TICK_SPACING).toString()
      );
      setMinPriceError(UNISWAP_MIN_PRICE_MESSAGE);
      // Validate starting price after min price change
      validateStartingPriceOnBlur();
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
      // Validate starting price after min price change
      validateStartingPriceOnBlur();
      return;
    }

    onMarketChange(
      'baseAssetMinPriceTick',
      priceToTick(numPrice, TICK_SPACING).toString()
    );
    setMinPriceError(null);

    // Validate starting price after min price change
    validateStartingPriceOnBlur();
  };

  // Helper function to validate starting price on blur
  const validateStartingPriceOnBlur = () => {
    const currentStartingPrice = Number(market.startingPrice);
    const minPrice = Number(market.lowTickPrice);
    const maxPrice = Number(market.highTickPrice);

    if (currentStartingPrice > 0 && minPrice > 0 && maxPrice > 0) {
      if (currentStartingPrice < minPrice) {
        // Starting price is below min price, set it to min price
        onMarketChange('startingPrice', minPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(minPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MIN_ERROR);
      } else if (currentStartingPrice > maxPrice) {
        // Starting price is above max price, set it to max price
        onMarketChange('startingPrice', maxPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(maxPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MAX_ERROR);
      } else {
        setStartingPriceError(null);
      }
    }
  };

  // Handle max price change and convert to tick
  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = e.target.value;
    onMarketChange('highTickPrice', price.toString());

    // Only validate when not focused (e.g., arrow keys)
    if (!isMaxPriceFocused) {
      const numPrice = Number(price);
      const minPrice = Number(market.lowTickPrice);
      const currentStartingPrice = Number(market.startingPrice);

      // Check if max price is below min price
      if (numPrice > 0 && minPrice > 0 && numPrice < minPrice) {
        // Set max price to min price
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

      // Always update tick
      if (numPrice > 0) {
        onMarketChange(
          'baseAssetMaxPriceTick',
          priceToTick(numPrice, TICK_SPACING).toString()
        );
      }
      setMaxPriceError(null);

      // Check if starting price is above the new max price
      if (
        currentStartingPrice > 0 &&
        numPrice > 0 &&
        currentStartingPrice > numPrice
      ) {
        // Starting price is above the new max price, set it to max price
        onMarketChange('startingPrice', numPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(numPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MAX_ERROR);
      } else {
        setStartingPriceError(null);
      }
    }
  };

  const handleMaxPriceBlur = () => {
    setIsMaxPriceFocused(false);
    const numPrice = Number(market.highTickPrice);
    const minPrice = Number(market.lowTickPrice);

    if (numPrice <= 0) {
      onMarketChange('highTickPrice', UNISWAP_MIN_PRICE);
      onMarketChange(
        'baseAssetMaxPriceTick',
        priceToTick(Number(UNISWAP_MIN_PRICE), TICK_SPACING).toString()
      );
      setMaxPriceError(UNISWAP_MIN_PRICE_MESSAGE);
      // Validate starting price after max price change
      validateStartingPriceOnBlur();
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
      // Validate starting price after max price change
      validateStartingPriceOnBlur();
      return;
    }

    onMarketChange(
      'baseAssetMaxPriceTick',
      priceToTick(numPrice, TICK_SPACING).toString()
    );
    setMaxPriceError(null);

    // Validate starting price after max price change
    validateStartingPriceOnBlur();
  };

  const handleStartingPriceFocus = () => {
    setIsStartingPriceFocused(true);
    setStartingPriceError(null);
  };

  const handleStartingPriceBlur = () => {
    setIsStartingPriceFocused(false);
    // Trigger validation on blur
    const numPrice = Number(market.startingPrice);
    const minPrice = Number(market.lowTickPrice);
    const maxPrice = Number(market.highTickPrice);

    if (numPrice > 0 && minPrice > 0 && maxPrice > 0) {
      if (numPrice < minPrice) {
        onMarketChange('startingPrice', minPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(minPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MIN_ERROR);
      } else if (numPrice > maxPrice) {
        onMarketChange('startingPrice', maxPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(maxPrice).toString()
        );
        setStartingPriceError(STARTING_PRICE_MAX_ERROR);
      } else {
        setStartingPriceError(null);
      }
    }
  };

  return (
    <div className="space-y-4 py-4">
      {/* Market Question */}
      <div>
        <Label htmlFor={fieldId('marketQuestion')}>Market Question</Label>
        <Input
          id={fieldId('marketQuestion')}
          type="text"
          value={market.marketQuestion}
          onChange={(e) => onMarketChange('marketQuestion', e.target.value)}
          placeholder="Will Zohran become the Mayor of NYC?"
          required
          disabled={disabledFields?.marketQuestion}
        />
      </div>

      {/* Short Name and Option Name */}
      <div className={'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div>
          <Label htmlFor={fieldId('shortName')}>Short Name (optional)</Label>
          <Input
            id={fieldId('shortName')}
            type="text"
            value={market.shortName || ''}
            onChange={(e) => onMarketChange('shortName', e.target.value)}
            placeholder="Zohran for NYC Mayor"
            disabled={false}
          />
        </div>
        <div>
          <Label htmlFor={fieldId('optionName')}>
            Option Name (Multi-choice only)
          </Label>
          <Input
            id={fieldId('optionName')}
            type="text"
            value={market.optionName || ''}
            onChange={(e) => onMarketChange('optionName', e.target.value)}
            placeholder="Zohran Mamdani"
            disabled={disabledFields?.optionName}
          />
        </div>
      </div>

      {/* Claim Statements */}
      <div className={'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {/* Claim Statement Yes or Numeric */}
        <div>
          <Label htmlFor={fieldId('claimStatementYesOrNumeric')}>
            Affirmative Claim Statement
          </Label>
          <Textarea
            id={fieldId('claimStatementYesOrNumeric')}
            value={displayClaimYesOrNumeric}
            onChange={(e) =>
              onMarketChange('claimStatementYesOrNumeric', e.target.value)
            }
            placeholder="Mamdani became the mayor."
            required
            disabled={disabledFields?.claimStatementYesOrNumeric}
          />
          <p className="text-sm text-muted-foreground mt-1">
            This will be followed by the settlement value for numeric markets
          </p>
        </div>

        {/* Claim Statement No */}
        <div>
          <Label htmlFor={fieldId('claimStatementNo')}>
            Negative Claim Statement
          </Label>
          <Textarea
            id={fieldId('claimStatementNo')}
            value={displayClaimNo}
            onChange={(e) => onMarketChange('claimStatementNo', e.target.value)}
            placeholder="Mamdani didn't become the mayor."
            disabled={disabledFields?.claimStatementNo}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Only add for Yes/No markets
          </p>
        </div>
      </div>

      {/* Similar Markets */}
      <div>
        <Label htmlFor={fieldId('similarMarkets')}>
          Similar Markets (Optional)
        </Label>
        <textarea
          id={fieldId('similarMarkets')}
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={market.similarMarkets?.join('\n') || ''}
          onChange={(e) => {
            const urls = e.target.value
              .split('\n')
              .filter((url) => url.trim() !== '');
            onMarketChange('similarMarkets', urls);
          }}
          placeholder="Enter URLs of similar markets, one per line&#10;Example:&#10;/market/123&#10;/market/456"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Enter one market URL per line. These markets will be marked as similar
          to this one.
        </p>
      </div>

      {/* Start/End Times */}
      <div className={'grid grid-cols-1 md:grid-cols-2 gap-6'}>
        <div>
          <Label htmlFor={fieldId('startTime')}>Start Time (UTC)</Label>
          <DateTimePicker
            id={fieldId('startTime')}
            value={startTimestamp}
            onChange={(timestamp: number) =>
              handleDateTimeChange('startTime', timestamp)
            }
            min={1}
            max={endTimestamp > 0 ? endTimestamp : undefined}
            timePart={getTimePart(startTimestamp)}
            disabled={disabledFields?.startTime}
          />
        </div>
        <div>
          <Label htmlFor={fieldId('endTime')}>End Time (UTC)</Label>
          <DateTimePicker
            id={fieldId('endTime')}
            value={endTimestamp}
            onChange={(timestamp: number) =>
              handleDateTimeChange('endTime', timestamp)
            }
            min={startTimestamp}
            timePart={getTimePart(endTimestamp)}
            disabled={disabledFields?.endTime}
          />
        </div>
      </div>

      {/* Pricing Params */}
      <div className={'grid grid-cols-1 md:grid-cols-3 gap-4'}>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={fieldId('lowTickPrice')}>Min Price</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>tick: {market.baseAssetMinPriceTick}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
            disabled={isPricingDisabled}
          />
          {minPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {minPriceError}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={fieldId('startingPrice')}>Starting Price</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p>
                      computed sqrtPriceX96:{' '}
                      {priceToSqrtPriceX96(
                        Number(market.startingPrice)
                      ).toString()}
                    </p>
                    <p>
                      computed inverse:{' '}
                      {(
                        Number(
                          sqrtPriceX96ToPriceD18(
                            priceToSqrtPriceX96(Number(market.startingPrice))
                          )
                        ) /
                        10 ** 18
                      ).toString()}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id={fieldId('startingPrice')}
            type="number"
            value={market.startingPrice || ''}
            onChange={handlePriceChange}
            onFocus={handleStartingPriceFocus}
            onBlur={handleStartingPriceBlur}
            placeholder="e.g., 1.23"
            required
            inputMode="decimal"
            step="any"
            min="0"
            disabled={isPricingDisabled}
          />
          {startingPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {startingPriceError}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={fieldId('highTickPrice')}>Max Price</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>tick: {market.baseAssetMaxPriceTick}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
            disabled={isPricingDisabled}
          />
          {maxPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {maxPriceError}
            </div>
          )}
        </div>
      </div>
      {/* Visibility */}
      <div className={'flex items-center gap-2 pt-2'}>
        <Switch
          id={fieldId('public')}
          checked={market.public}
          onCheckedChange={(checked) => onMarketChange('public', checked)}
        />
        <Label htmlFor={fieldId('public')} className="cursor-pointer">
          Public
        </Label>
      </div>
    </div>
  );
};

export default MarketFormFields;
