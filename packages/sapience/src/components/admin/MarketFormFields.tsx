'use client';

import { Button, Input, Label } from '@sapience/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Switch } from '@sapience/ui/components/ui/switch';
import { Loader2, Copy, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

import { useEnrichedMarketGroups } from '../../hooks/graphql/useMarketGroups';
import { TICK_SPACING } from '../../lib/constants/numbers';
import { priceToTick, tickToPrice } from '../../lib/utils/tickUtils';
import {
  priceToSqrtPriceX96,
  sqrtPriceX96ToPriceD18,
} from '../../lib/utils/util';
import DateTimePicker from '../shared/DateTimePicker';

// Type definitions for the copy functions
interface MarketCopyData {
  question?: string | null;
  optionName?: string | null;
  baseAssetMinPriceTick?: number | null;
  baseAssetMaxPriceTick?: number | null;
  rules?: string | null;
  marketParams?: {
    claimStatement?: string | null;
  } | null;
}

interface MarketGroupCopyData {
  question?: string | null;
  category?: {
    slug?: string | null;
    id?: string | null;
  } | null;
  resource?: {
    id?: string | null;
  } | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  chainId?: number | null;
  factoryAddress?: string | null;
  owner?: string | null;
  collateralAsset?: string | null;
  minTradeSize?: string | null;
  claimStatement?: string | null;
  marketParams?: {
    feeRate?: number | null;
    assertionLiveness?: string | null;
    bondAmount?: string | null;
    bondCurrency?: string | null;
    uniswapPositionManager?: string | null;
    uniswapSwapRouter?: string | null;
    uniswapQuoter?: string | null;
    optimisticOracleV3?: string | null;
    claimStatement?: string | null;
  } | null;
}

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

const STARTING_PRICE_MIN_ERROR =
  'Starting price cannot be less than min price. Set to min price value.';
const STARTING_PRICE_MAX_ERROR =
  'Starting price cannot be greater than max price. Set to max price value.';

interface MarketFormFieldsProps {
  market: MarketInput;
  onMarketChange: (field: keyof MarketInput, value: string) => void;
  marketIndex?: number;
  isCompact?: boolean;
  // Additional props for market group level data
  onMarketGroupChange?: (field: string, value: string) => void;
  // Remove unused props
  // Advanced configuration props
  onAdvancedConfigChange?: (field: string, value: string) => void;
}

const MarketFormFields = ({
  market,
  onMarketChange,
  marketIndex,
  isCompact,
  onMarketGroupChange,
  onAdvancedConfigChange,
}: MarketFormFieldsProps) => {
  const [error, setError] = useState<string | null>(null);
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [maxPriceError, setMaxPriceError] = useState<string | null>(null);
  const [startingPriceError, setStartingPriceError] = useState<string | null>(
    null
  );
  const [isMinPriceFocused, setIsMinPriceFocused] = useState(false);
  const [isMaxPriceFocused, setIsMaxPriceFocused] = useState(false);
  const [isStartingPriceFocused, setIsStartingPriceFocused] = useState(false);

  // Market selection state
  const [selectedMarketGroupId, setSelectedMarketGroupId] =
    useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [copyMarketGroupParams, setCopyMarketGroupParams] =
    useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMarketGroupDropdown, setShowMarketGroupDropdown] =
    useState<boolean>(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] =
    useState<number>(-1);

  // Fetch available market groups
  const { data: marketGroups } = useEnrichedMarketGroups();

  // Constants for duplicate strings
  const UNISWAP_MIN_PRICE = '0.00009908435194807992';
  const UNISWAP_MIN_PRICE_MESSAGE =
    'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992';

  // Filter market groups by category and search query
  const filteredMarketGroups = useMemo(() => {
    if (!marketGroups) return [];

    return marketGroups.filter((group) => {
      // Filter by category
      if (categoryFilter !== 'all' && group.category?.slug !== categoryFilter) {
        return false;
      }

      // Filter by search query (case-insensitive substring search)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const question = group.question?.toLowerCase() || '';
        const hasMatchingQuestion = question.includes(query);

        // Also check if any market in the group matches the search
        const hasMatchingMarket = group.markets.some((marketItem) => {
          const marketQuestion = marketItem.question?.toLowerCase() || '';
          const optionName = marketItem.optionName?.toLowerCase() || '';
          return marketQuestion.includes(query) || optionName.includes(query);
        });

        if (!hasMatchingQuestion && !hasMatchingMarket) {
          return false;
        }
      }

      return true;
    });
  }, [marketGroups, categoryFilter, searchQuery]);

  // Get unique categories for filter dropdown
  const availableCategories = useMemo(() => {
    if (!marketGroups) return [];

    const categories = new Map<
      string,
      { id: string; name: string; slug: string }
    >();

    marketGroups.forEach((group) => {
      if (group.category) {
        categories.set(group.category.slug, {
          id: group.category.id,
          name: group.category.name,
          slug: group.category.slug,
        });
      }
    });

    return Array.from(categories.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [marketGroups]);

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
    if (!value || value.trim() === '') {
      return 0; // Return 0 for empty values
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : parsed;
  };

  const startTimestamp = parseTimestamp(market.startTime);
  const endTimestamp = parseTimestamp(market.endTime);

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

  const handleMarketChange = (marketId: string) => {
    setSelectedMarketId(marketId);
  };

  // Reset market selection when filters change
  useEffect(() => {
    setSelectedMarketGroupId('');
    setSelectedMarketId('');
  }, [categoryFilter, searchQuery]);

  // Helper function to decode hex claim statement
  const decodeClaimStatement = (claimStatement: string): string => {
    if (!claimStatement) return '';

    // If it's a hex string, decode it
    if (claimStatement.startsWith('0x') && claimStatement.length > 2) {
      try {
        // Remove '0x' prefix and convert hex to string
        const hexString = claimStatement.slice(2);
        // Convert hex to bytes and then to string
        const bytes = new Uint8Array(
          hexString.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );
        return new TextDecoder('utf-8').decode(bytes);
      } catch (decodeError) {
        console.error('Failed to decode hex claim statement:', decodeError);
        return claimStatement; // Return original if decoding fails
      }
    }

    return claimStatement; // Return as-is if not hex
  };

  // Split the complex copyMarketParameters function into smaller functions
  const copyMarketBasicData = (selectedMarket: MarketCopyData) => {
    // Convert tick prices to decimal prices using tickToPrice function
    const minPrice =
      selectedMarket.baseAssetMinPriceTick !== null &&
      selectedMarket.baseAssetMinPriceTick !== undefined
        ? tickToPrice(
            Number(selectedMarket.baseAssetMinPriceTick),
            TICK_SPACING
          ).toString()
        : '';
    const maxPrice =
      selectedMarket.baseAssetMaxPriceTick !== null &&
      selectedMarket.baseAssetMaxPriceTick !== undefined
        ? tickToPrice(
            Number(selectedMarket.baseAssetMaxPriceTick),
            TICK_SPACING
          ).toString()
        : '';

    // Copy all parameters
    onMarketChange('marketQuestion', selectedMarket.question || '');
    onMarketChange('optionName', selectedMarket.optionName || '');

    // Set start time to current time + 1 minute, leave end time undefined
    const currentTimePlusOneMinute = Math.floor(Date.now() / 1000) + 60; // Current time + 1 minute in seconds
    onMarketChange('startTime', currentTimePlusOneMinute.toString());
    onMarketChange('endTime', ''); // Leave end time undefined

    onMarketChange(
      'baseAssetMinPriceTick',
      selectedMarket.baseAssetMinPriceTick?.toString() || ''
    );
    onMarketChange(
      'baseAssetMaxPriceTick',
      selectedMarket.baseAssetMaxPriceTick?.toString() || ''
    );
    onMarketChange('lowTickPrice', minPrice);
    onMarketChange('highTickPrice', maxPrice);

    return { minPrice, maxPrice };
  };

  const copyMarketGroupData = (selectedMarketGroup: MarketGroupCopyData) => {
    if (!onMarketGroupChange || !copyMarketGroupParams) return;

    // Copy market group question
    if (selectedMarketGroup.question) {
      onMarketGroupChange('question', selectedMarketGroup.question);
    }

    // Copy category
    if (selectedMarketGroup.category?.slug) {
      onMarketGroupChange('category', selectedMarketGroup.category.slug);
    } else if (selectedMarketGroup.category?.id) {
      onMarketGroupChange(
        'category',
        selectedMarketGroup.category.id.toString()
      );
    }

    // Copy resource (index)
    if (selectedMarketGroup.resource?.id) {
      onMarketGroupChange(
        'resourceId',
        selectedMarketGroup.resource.id.toString()
      );
    } else {
      onMarketGroupChange('resourceId', 'none');
    }

    // Copy token names
    if (selectedMarketGroup.baseTokenName) {
      onMarketGroupChange('baseTokenName', selectedMarketGroup.baseTokenName);
    }
    if (selectedMarketGroup.quoteTokenName) {
      onMarketGroupChange('quoteTokenName', selectedMarketGroup.quoteTokenName);
    }
  };

  const copyAdvancedConfig = (selectedMarketGroup: MarketGroupCopyData) => {
    if (!onAdvancedConfigChange) return;

    // Copy basic config
    if (selectedMarketGroup.chainId) {
      onAdvancedConfigChange('chainId', selectedMarketGroup.chainId.toString());
    }
    if (selectedMarketGroup.factoryAddress) {
      onAdvancedConfigChange(
        'factoryAddress',
        selectedMarketGroup.factoryAddress
      );
    }
    if (selectedMarketGroup.owner) {
      onAdvancedConfigChange('owner', selectedMarketGroup.owner);
    }
    if (selectedMarketGroup.collateralAsset) {
      onAdvancedConfigChange(
        'collateralAsset',
        selectedMarketGroup.collateralAsset
      );
    }
    if (selectedMarketGroup.minTradeSize) {
      onAdvancedConfigChange('minTradeSize', selectedMarketGroup.minTradeSize);
    }

    // Copy market parameters
    if (selectedMarketGroup.marketParams) {
      const params = selectedMarketGroup.marketParams;
      onAdvancedConfigChange('feeRate', (params.feeRate || '').toString());
      onAdvancedConfigChange(
        'assertionLiveness',
        (params.assertionLiveness || '').toString()
      );
      onAdvancedConfigChange(
        'bondAmount',
        (params.bondAmount || '').toString()
      );
      onAdvancedConfigChange('bondCurrency', params.bondCurrency || '');
      onAdvancedConfigChange(
        'uniswapPositionManager',
        params.uniswapPositionManager || ''
      );
      onAdvancedConfigChange(
        'uniswapSwapRouter',
        params.uniswapSwapRouter || ''
      );
      onAdvancedConfigChange('uniswapQuoter', params.uniswapQuoter || '');
      onAdvancedConfigChange(
        'optimisticOracleV3',
        params.optimisticOracleV3 || ''
      );
    }
  };

  const copyMarketParameters = () => {
    if (!selectedMarketGroupId || !selectedMarketId || !marketGroups) return;

    setIsLoadingMarkets(true);

    try {
      const selectedMarketGroup = marketGroups.find(
        (group) => group.id === selectedMarketGroupId
      );
      if (!selectedMarketGroup) return;

      const selectedMarket = selectedMarketGroup.markets.find(
        (marketItem) => marketItem.id === selectedMarketId
      );
      if (!selectedMarket) return;

      // Copy basic market data
      const { minPrice, maxPrice } = copyMarketBasicData(selectedMarket);

      // Copy market group data if enabled
      if (selectedMarketGroup) {
        copyMarketGroupData(selectedMarketGroup);
        // Copy advanced configuration
        copyAdvancedConfig(selectedMarketGroup);
      }

      // Copy rules
      if (selectedMarket.rules) {
        onMarketChange('rules', selectedMarket.rules);
      }

      // Set starting price to middle of min and max if available
      if (
        minPrice !== null &&
        minPrice !== undefined &&
        maxPrice !== null &&
        maxPrice !== undefined &&
        !Number.isNaN(minPrice) &&
        !Number.isNaN(maxPrice)
      ) {
        const min = Number(minPrice);
        const max = Number(maxPrice);
        const startingPrice = ((min + max) / 2).toString();
        onMarketChange('startingPrice', startingPrice);
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(Number(startingPrice)).toString()
        );
      }

      // Copy claim statement - try multiple sources
      let claimStatement = '';

      if (selectedMarketGroup.marketParamsClaimstatement) {
        claimStatement = selectedMarketGroup.marketParamsClaimstatement;
      } else if (selectedMarket.marketParamsClaimstatement) {
        claimStatement = selectedMarket.marketParamsClaimstatement;
      }

      if (claimStatement) {
        const decodedClaimStatement = decodeClaimStatement(claimStatement);
        onMarketChange('claimStatement', decodedClaimStatement);
      }

      // Clear selections after copying
      setSelectedMarketGroupId('');
      setSelectedMarketId('');
      setCategoryFilter('all');
      setSearchQuery('');
    } catch (copyError) {
      console.error('Error copying market parameters:', copyError);
      setError('Failed to copy market parameters. Please try again.');
    } finally {
      setIsLoadingMarkets(false);
    }
  };

  return (
    <div className="space-y-4 py-4">
      {error && <div className="text-sm text-red-500 mb-2">{error}</div>}

      {/* Market Selection Section */}
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Copy className="h-4 w-4" />
          <Label className="text-sm font-medium">
            Copy from Existing Market
          </Label>
        </div>

        <div className="space-y-3">
          {/* Category Filter */}
          <div>
            <Label htmlFor={fieldId('categoryFilter')} className="text-xs">
              Filter by Category
            </Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id={fieldId('categoryFilter')} className="h-9">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {availableCategories.map((categoryItem) => (
                  <SelectItem key={categoryItem.slug} value={categoryItem.slug}>
                    {categoryItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Input with Dynamic Dropdown */}
          <div className="relative">
            <Label htmlFor={fieldId('searchQuery')} className="text-xs">
              Search Markets
            </Label>
            <Input
              id={fieldId('searchQuery')}
              type="text"
              value={
                selectedMarketGroupId
                  ? marketGroups?.find((g) => g.id === selectedMarketGroupId)
                      ?.question || `Market Group ${selectedMarketGroupId}`
                  : searchQuery
              }
              onChange={(e) => {
                if (!selectedMarketGroupId) {
                  setSearchQuery(e.target.value);
                }
              }}
              onFocus={() => {
                if (!selectedMarketGroupId) {
                  setShowMarketGroupDropdown(true);
                  setSelectedDropdownIndex(-1);
                }
              }}
              onBlur={(e) => {
                // Check if the related target is within the dropdown
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (
                  relatedTarget &&
                  relatedTarget.closest('.market-group-dropdown')
                ) {
                  return; // Don't hide dropdown if clicking inside it
                }
                // Delay hiding to allow clicking on dropdown items
                setTimeout(() => setShowMarketGroupDropdown(false), 200);
              }}
              onKeyDown={(e) => {
                if (!showMarketGroupDropdown || !filteredMarketGroups.length)
                  return;

                switch (e.key) {
                  case 'ArrowDown':
                    e.preventDefault();
                    setSelectedDropdownIndex((prev) =>
                      prev < filteredMarketGroups.length - 1 ? prev + 1 : 0
                    );
                    break;
                  case 'ArrowUp':
                    e.preventDefault();
                    setSelectedDropdownIndex((prev) =>
                      prev > 0 ? prev - 1 : filteredMarketGroups.length - 1
                    );
                    break;
                  case 'Enter':
                    e.preventDefault();
                    if (
                      selectedDropdownIndex >= 0 &&
                      selectedDropdownIndex < filteredMarketGroups.length
                    ) {
                      const selectedGroup =
                        filteredMarketGroups[selectedDropdownIndex];
                      setSelectedMarketGroupId(selectedGroup.id);
                      setShowMarketGroupDropdown(false);
                      setSelectedDropdownIndex(-1);
                    }
                    break;
                  case 'Escape':
                    setShowMarketGroupDropdown(false);
                    setSelectedDropdownIndex(-1);
                    break;
                  default:
                    break;
                }
              }}
              placeholder={
                selectedMarketGroupId
                  ? 'Market group selected'
                  : 'Search by question or market name...'
              }
              className="h-9"
              readOnly={!!selectedMarketGroupId}
            />

            {/* Clear selection button */}
            {selectedMarketGroupId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMarketGroupId('');
                  setSelectedMarketId('');
                  setSearchQuery('');
                  setShowMarketGroupDropdown(false);
                  setSelectedDropdownIndex(-1);
                }}
                className="absolute right-2 top-1/2 transform text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Dynamic Market Group Dropdown */}
            {showMarketGroupDropdown && filteredMarketGroups.length > 0 && (
              <div
                className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto market-group-dropdown"
                role="listbox"
                tabIndex={0}
                onMouseDown={(e) => {
                  // Prevent the input from losing focus when clicking inside dropdown
                  e.preventDefault();
                }}
                onKeyDown={(e) => {
                  // Handle keyboard navigation
                  if (e.key === 'Escape') {
                    setShowMarketGroupDropdown(false);
                    setSelectedDropdownIndex(-1);
                  }
                }}
              >
                {filteredMarketGroups.map((group, index) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none text-sm border-b border-border last:border-b-0 ${
                      index === selectedDropdownIndex ? 'bg-muted' : ''
                    }`}
                    onMouseDown={(e) => {
                      // Prevent the input from losing focus
                      e.preventDefault();
                    }}
                    onMouseEnter={() => setSelectedDropdownIndex(index)}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedMarketGroupId(group.id);
                      setShowMarketGroupDropdown(false);
                      setSelectedDropdownIndex(-1);
                    }}
                  >
                    <div className="font-medium truncate">
                      {group.question || `Market Group ${group.id}`}
                    </div>
                    {group.category && (
                      <div className="text-xs text-muted-foreground">
                        {group.category.name}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* No results message */}
            {showMarketGroupDropdown &&
              searchQuery &&
              filteredMarketGroups.length === 0 && (
                <div
                  className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground market-group-dropdown"
                  role="status"
                  aria-live="polite"
                >
                  No market groups found
                </div>
              )}
          </div>

          {/* Market Selection */}
          {selectedMarketGroupId && (
            <div>
              <Label htmlFor={fieldId('marketSelect')} className="text-xs">
                Market
              </Label>
              <Select
                value={selectedMarketId}
                onValueChange={handleMarketChange}
                disabled={!selectedMarketGroupId}
              >
                <SelectTrigger id={fieldId('marketSelect')} className="h-9">
                  <SelectValue placeholder="Select a market" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const selectedGroup = marketGroups?.find(
                      (group) => group.id === selectedMarketGroupId
                    );
                    if (!selectedGroup) return null;

                    if (selectedGroup.markets.length === 0) {
                      return (
                        <SelectItem value="no-markets" disabled>
                          No markets found
                        </SelectItem>
                      );
                    }

                    return selectedGroup.markets.map((marketItem) => (
                      <SelectItem key={marketItem.id} value={marketItem.id}>
                        {marketItem.optionName ||
                          marketItem.question ||
                          `Market ${marketItem.marketId}`}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Copy Options Toggle */}
          {selectedMarketGroupId && selectedMarketId && (
            <div className="flex items-center justify-between p-3 bg-background rounded-md border">
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Copy Market Group Parameters
                </Label>
                <p className="text-xs text-muted-foreground">
                  Also copy question, category, index, and token names
                </p>
              </div>
              <Switch
                checked={copyMarketGroupParams}
                onCheckedChange={setCopyMarketGroupParams}
                id={fieldId('copyMarketGroupParams')}
              />
            </div>
          )}

          {/* Copy Summary */}
          {selectedMarketGroupId && selectedMarketId && (
            <div className="p-3 bg-muted/50 rounded-md border">
              <p className="text-xs font-medium mb-2">What will be copied:</p>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Always:</span> Market question,
                  option name, prices, claim statement, rules (if any of these
                  are present in the database)
                </div>
                {copyMarketGroupParams && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Also:</span> Market group
                    question, category, index, base/quote token names, and
                    advanced configuration
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Copy Button */}
          {selectedMarketGroupId && selectedMarketId && (
            <Button
              type="button"
              onClick={copyMarketParameters}
              disabled={isLoadingMarkets}
              size="sm"
              className="w-full"
            >
              {isLoadingMarkets ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Copying...
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-3 w-3" />
                  {copyMarketGroupParams
                    ? 'Copy Market + Group Parameters'
                    : 'Copy Market Parameters Only'}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

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
          <Label htmlFor={fieldId('startTime')}>Start Time (UTC)</Label>
          <DateTimePicker
            id={fieldId('startTime')}
            value={startTimestamp}
            onChange={(timestamp: number) =>
              handleDateTimeChange('startTime', timestamp)
            }
            min={0}
            max={endTimestamp > 0 ? endTimestamp : undefined}
            timePart={getTimePart(startTimestamp)}
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
            onFocus={handleStartingPriceFocus}
            onBlur={handleStartingPriceBlur}
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
          {startingPriceError && (
            <div className="text-xs text-red-500 mt-1 w-full text-center">
              {startingPriceError}
            </div>
          )}
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
