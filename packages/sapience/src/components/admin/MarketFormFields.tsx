'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Switch } from '@sapience/ui/components/ui/switch';
import { useState, useEffect, useMemo } from 'react';
import { Copy, Loader2, X } from 'lucide-react';

import { TICK_SPACING } from '../../lib/constants/numbers';
import { priceToTick, tickToPrice } from '../../lib/utils/tickUtils';
import {
  priceToSqrtPriceX96,
  sqrtPriceX96ToPriceD18,
} from '../../lib/utils/util';
import { useEnrichedMarketGroups } from '../../hooks/graphql/useMarketGroups';
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
  // Additional props for market group level data
  onMarketGroupChange?: (field: string, value: string) => void;
  marketGroupQuestion?: string;
  category?: string;
  resourceId?: string;
  baseTokenName?: string;
  quoteTokenName?: string;
  // Advanced configuration props
  chainId?: string;
  factoryAddress?: string;
  owner?: string;
  collateralAsset?: string;
  minTradeSize?: string;
  marketParams?: {
    feeRate: string;
    assertionLiveness: string;
    bondAmount: string;
    bondCurrency: string;
    uniswapPositionManager: string;
    uniswapSwapRouter: string;
    uniswapQuoter: string;
    optimisticOracleV3: string;
  };
  onAdvancedConfigChange?: (field: string, value: string) => void;
}

const MarketFormFields = ({
  market,
  onMarketChange,
  marketIndex,
  isCompact,
  onMarketGroupChange,
  marketGroupQuestion,
  category,
  resourceId,
  baseTokenName,
  quoteTokenName,
  chainId,
  factoryAddress,
  owner,
  collateralAsset,
  minTradeSize,
  marketParams,
  onAdvancedConfigChange,
}: MarketFormFieldsProps) => {
  const [error, setError] = useState<string | null>(null);
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [maxPriceError, setMaxPriceError] = useState<string | null>(null);
  const [startingPriceError, setStartingPriceError] = useState<string | null>(null);
  const [isMinPriceFocused, setIsMinPriceFocused] = useState(false);
  const [isMaxPriceFocused, setIsMaxPriceFocused] = useState(false);
  const [isStartingPriceFocused, setIsStartingPriceFocused] = useState(false);
  
  // Market selection state
  const [selectedMarketGroupId, setSelectedMarketGroupId] = useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [copyMarketGroupParams, setCopyMarketGroupParams] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMarketGroupDropdown, setShowMarketGroupDropdown] = useState<boolean>(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState<number>(-1);

  // Fetch available market groups
  const { data: marketGroups, isLoading: isLoadingMarketGroups } = useEnrichedMarketGroups();

  // Filter market groups by category and search query
  const filteredMarketGroups = useMemo(() => {
    if (!marketGroups) return [];
    
    return marketGroups.filter(group => {
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
        const hasMatchingMarket = group.markets.some(market => {
          const marketQuestion = market.question?.toLowerCase() || '';
          const optionName = market.optionName?.toLowerCase() || '';
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
    
    const categories = new Map<string, { id: string; name: string; slug: string }>();
    
    marketGroups.forEach(group => {
      if (group.category) {
        categories.set(group.category.slug, {
          id: group.category.id,
          name: group.category.name,
          slug: group.category.slug
        });
      }
    });
    
    return Array.from(categories.values()).sort((a, b) => a.name.localeCompare(b.name));
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
          setStartingPriceError(
            'Starting price cannot be less than min price. Set to min price value.'
          );
        } else if (numPrice > maxPrice) {
          // Set starting price to max price
          onMarketChange('startingPrice', maxPrice.toString());
          onMarketChange(
            'startingSqrtPriceX96',
            priceToSqrtPriceX96(maxPrice).toString()
          );
          setStartingPriceError(
            'Starting price cannot be greater than max price. Set to max price value.'
          );
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
      if (currentStartingPrice > 0 && numPrice > 0 && currentStartingPrice < numPrice) {
        // Starting price is below the new min price, set it to min price
        onMarketChange('startingPrice', numPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(numPrice).toString()
        );
        setStartingPriceError(
          'Starting price cannot be less than min price. Set to min price value.'
        );
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
      const uniswapMinPrice = 0.00009908435194807992;
      onMarketChange('lowTickPrice', uniswapMinPrice.toString());
      onMarketChange(
        'baseAssetMinPriceTick',
        priceToTick(uniswapMinPrice, TICK_SPACING).toString()
      );
      setMinPriceError(
        'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992'
      );
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
        setStartingPriceError(
          'Starting price cannot be less than min price. Set to min price value.'
        );
      } else if (currentStartingPrice > maxPrice) {
        // Starting price is above max price, set it to max price
        onMarketChange('startingPrice', maxPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(maxPrice).toString()
        );
        setStartingPriceError(
          'Starting price cannot be greater than max price. Set to max price value.'
        );
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
      if (currentStartingPrice > 0 && numPrice > 0 && currentStartingPrice > numPrice) {
        // Starting price is above the new max price, set it to max price
        onMarketChange('startingPrice', numPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(numPrice).toString()
        );
        setStartingPriceError(
          'Starting price cannot be greater than max price. Set to max price value.'
        );
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
      const uniswapMinPrice = 0.00009908435194807992;
      onMarketChange('highTickPrice', uniswapMinPrice.toString());
      onMarketChange(
        'baseAssetMaxPriceTick',
        priceToTick(uniswapMinPrice, TICK_SPACING).toString()
      );
      setMaxPriceError(
        'Price is too low for Uniswap. Minimum price set to 0.00009908435194807992'
      );
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
        setStartingPriceError(
          'Starting price cannot be less than min price. Set to min price value.'
        );
      } else if (numPrice > maxPrice) {
        onMarketChange('startingPrice', maxPrice.toString());
        onMarketChange(
          'startingSqrtPriceX96',
          priceToSqrtPriceX96(maxPrice).toString()
        );
        setStartingPriceError(
          'Starting price cannot be greater than max price. Set to max price value.'
        );
      } else {
        setStartingPriceError(null);
      }
    }
  };

  // Market selection and copying logic
  const handleMarketGroupChange = (marketGroupId: string) => {
    setSelectedMarketGroupId(marketGroupId);
    setSelectedMarketId(''); // Reset market selection when group changes
  };

  const handleMarketChange = (marketId: string) => {
    setSelectedMarketId(marketId);
  };

  // Reset market selection when filters change
  useEffect(() => {
    setSelectedMarketGroupId('');
    setSelectedMarketId('');
  }, [categoryFilter, searchQuery]);

  const copyMarketParameters = () => {
    if (!selectedMarketGroupId || !selectedMarketId || !marketGroups) return;

    setIsLoadingMarkets(true);
    
    try {
      const selectedMarketGroup = marketGroups.find(group => group.id === selectedMarketGroupId);
      if (!selectedMarketGroup) return;

      const selectedMarket = selectedMarketGroup.markets.find(market => market.id === selectedMarketId);
      if (!selectedMarket) return;

      // Debug logging to see what data is available
      console.log('Selected Market Group:', selectedMarketGroup);
      console.log('Selected Market:', selectedMarket);

      // Convert tick prices to decimal prices using tickToPrice function
      const minPrice = selectedMarket.baseAssetMinPriceTick !== null && selectedMarket.baseAssetMinPriceTick !== undefined
        ? tickToPrice(Number(selectedMarket.baseAssetMinPriceTick), TICK_SPACING).toString()
        : '';
      const maxPrice = selectedMarket.baseAssetMaxPriceTick !== null && selectedMarket.baseAssetMaxPriceTick !== undefined
        ? tickToPrice(Number(selectedMarket.baseAssetMaxPriceTick), TICK_SPACING).toString()
        : '';

      console.log(tickToPrice(Number(selectedMarket.baseAssetMaxPriceTick), TICK_SPACING).toString())

      // Copy all parameters
      onMarketChange('marketQuestion', selectedMarket.question || '');
      onMarketChange('optionName', selectedMarket.optionName || '');
      
      // Set start time to current time + 1 minute, leave end time undefined
      const currentTimePlusOneMinute = Math.floor(Date.now() / 1000) + 60; // Current time + 1 minute in seconds
      onMarketChange('startTime', currentTimePlusOneMinute.toString());
      onMarketChange('endTime', ''); // Leave end time undefined
      
      onMarketChange('baseAssetMinPriceTick', selectedMarket.baseAssetMinPriceTick?.toString() || '');
      onMarketChange('baseAssetMaxPriceTick', selectedMarket.baseAssetMaxPriceTick?.toString() || '');
      onMarketChange('lowTickPrice', minPrice);
      onMarketChange('highTickPrice', maxPrice);
      
      // Copy market group level data if onMarketGroupChange is provided and toggle is enabled
      if (onMarketGroupChange && copyMarketGroupParams) {
        // Copy market group question
        if (selectedMarketGroup.question) {
          onMarketGroupChange('question', selectedMarketGroup.question);
          console.log('Copied market group question:', selectedMarketGroup.question);
        }
        
        // Copy category - add detailed debugging
        console.log('Selected Market Group Category Object:', selectedMarketGroup.category);
        console.log('Category ID:', selectedMarketGroup.category?.id);
        console.log('Category Slug:', selectedMarketGroup.category?.slug);
        console.log('Category Name:', selectedMarketGroup.category?.name);
        
        if (selectedMarketGroup.category?.slug) {
          // Use slug instead of id since the form expects the slug (focus area ID)
          onMarketGroupChange('category', selectedMarketGroup.category.slug);
          console.log('Copied category slug:', selectedMarketGroup.category.slug);
        } else if (selectedMarketGroup.category?.id) {
          // Fallback to id if slug is not available
          onMarketGroupChange('category', selectedMarketGroup.category.id.toString());
          console.log('Copied category ID as fallback:', selectedMarketGroup.category.id);
        } else {
          console.log('No category found in selected market group');
        }
        
        // Copy resource (index)
        if (selectedMarketGroup.resource?.id) {
          onMarketGroupChange('resourceId', selectedMarketGroup.resource.id.toString());
          console.log('Copied resource ID:', selectedMarketGroup.resource.id);
        } else {
          // If no resource/index, set to "none" for Yes/No markets
          onMarketGroupChange('resourceId', 'none');
          console.log('No resource found, set to "none" for Yes/No markets');
        }
        
        // Copy base token name
        if (selectedMarketGroup.baseTokenName) {
          onMarketGroupChange('baseTokenName', selectedMarketGroup.baseTokenName);
          console.log('Copied base token name:', selectedMarketGroup.baseTokenName);
        }
        
        // Copy quote token name
        if (selectedMarketGroup.quoteTokenName) {
          onMarketGroupChange('quoteTokenName', selectedMarketGroup.quoteTokenName);
          console.log('Copied quote token name:', selectedMarketGroup.quoteTokenName);
        }
        
        // Copy advanced market group configuration if onAdvancedConfigChange is provided
        if (onAdvancedConfigChange) {
          // Copy chain ID
          if (selectedMarketGroup.chainId !== undefined && selectedMarketGroup.chainId !== null) {
            onAdvancedConfigChange('chainId', selectedMarketGroup.chainId.toString());
            console.log('Copied chain ID:', selectedMarketGroup.chainId);
          }
          
          // Copy factory address
          if (selectedMarketGroup.factoryAddress) {
            onAdvancedConfigChange('factoryAddress', selectedMarketGroup.factoryAddress);
            console.log('Copied factory address:', selectedMarketGroup.factoryAddress);
          }
          
          // Copy owner
          if (selectedMarketGroup.owner) {
            onAdvancedConfigChange('owner', selectedMarketGroup.owner);
            console.log('Copied owner:', selectedMarketGroup.owner);
          }
          
          // Copy collateral asset
          if (selectedMarketGroup.collateralAsset) {
            onAdvancedConfigChange('collateralAsset', selectedMarketGroup.collateralAsset);
            console.log('Copied collateral asset:', selectedMarketGroup.collateralAsset);
          }
          
          // Copy min trade size
          if (selectedMarketGroup.minTradeSize) {
            onAdvancedConfigChange('minTradeSize', selectedMarketGroup.minTradeSize);
            console.log('Copied min trade size:', selectedMarketGroup.minTradeSize);
          }
          
          // Copy market parameters
          if (selectedMarketGroup.marketParams) {
            const params = selectedMarketGroup.marketParams;
            onAdvancedConfigChange('feeRate', (params.feeRate || '').toString());
            onAdvancedConfigChange('assertionLiveness', (params.assertionLiveness || '').toString());
            onAdvancedConfigChange('bondAmount', (params.bondAmount || '').toString());
            onAdvancedConfigChange('bondCurrency', params.bondCurrency || '');
            onAdvancedConfigChange('uniswapPositionManager', params.uniswapPositionManager || '');
            onAdvancedConfigChange('uniswapSwapRouter', params.uniswapSwapRouter || '');
            onAdvancedConfigChange('uniswapQuoter', params.uniswapQuoter || '');
            onAdvancedConfigChange('optimisticOracleV3', params.optimisticOracleV3 || '');
            console.log('Copied market parameters');
          }
        }
      } else if (onMarketGroupChange && !copyMarketGroupParams) {
        console.log('Market group parameters copying is disabled');
      }

      // Copy rules
      if (selectedMarket.rules) {
        onMarketChange('rules', selectedMarket.rules);
        console.log('Copied rules:', selectedMarket.rules);
      } else {
        console.log('No rules found in selected market');
      }

      console.log('minPrice', minPrice);
      console.log('maxPrice', maxPrice);
      // For starting price, use the middle of min and max if available
      if (minPrice !== null  && minPrice !== undefined && maxPrice !== null && maxPrice !== undefined && !Number.isNaN(minPrice)  && !Number.isNaN(maxPrice)) {
        const min = Number(minPrice);
        const max = Number(maxPrice);
        const startingPrice = ((min + max) / 2).toString();
        onMarketChange('startingPrice', startingPrice);
        onMarketChange('startingSqrtPriceX96', priceToSqrtPriceX96(Number(startingPrice)).toString());
      }

      // Copy claim statement - try multiple sources
      let claimStatement = '';
      let claimStatementSource = '';
      
      if (selectedMarketGroup.claimStatement) {
        claimStatement = selectedMarketGroup.claimStatement;
        claimStatementSource = 'marketGroup.claimStatement';
      } else if (selectedMarketGroup.marketParams?.claimStatement) {
        claimStatement = selectedMarketGroup.marketParams.claimStatement;
        claimStatementSource = 'marketGroup.marketParams.claimStatement';
      } else if (selectedMarket.marketParams?.claimStatement) {
        claimStatement = selectedMarket.marketParams.claimStatement;
        claimStatementSource = 'selectedMarket.marketParams.claimStatement';
      }
      
      if (claimStatement) {
        const decodedClaimStatement = decodeClaimStatement(claimStatement);
        onMarketChange('claimStatement', decodedClaimStatement);
        console.log('Copied claim statement (source):', claimStatementSource);
        console.log('Copied claim statement (original):', claimStatement);
        console.log('Copied claim statement (decoded):', decodedClaimStatement);
      } else {
        console.log('No claim statement found in any location');
      }

      // Clear selections after copying
      setSelectedMarketGroupId('');
      setSelectedMarketId('');
      setCategoryFilter('all');
      setSearchQuery('');
      
    } catch (error) {
      console.error('Error copying market parameters:', error);
      setError('Failed to copy market parameters. Please try again.');
    } finally {
      setIsLoadingMarkets(false);
    }
  };

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
          hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
        );
        return new TextDecoder('utf-8').decode(bytes);
      } catch (error) {
        console.error('Failed to decode hex claim statement:', error);
        return claimStatement; // Return original if decoding fails
      }
    }
    
    return claimStatement; // Return as-is if not hex
  };

  return (
    <div className="space-y-4 py-4">
      {error && <div className="text-sm text-red-500 mb-2">{error}</div>}

      {/* Market Selection Section */}
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Copy className="h-4 w-4" />
          <Label className="text-sm font-medium">Copy from Existing Market</Label>
        </div>
        
        <div className="space-y-3">
          {/* Category Filter */}
          <div>
            <Label htmlFor={fieldId('categoryFilter')} className="text-xs">
              Filter by Category
            </Label>
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
            >
              <SelectTrigger id={fieldId('categoryFilter')} className="h-9">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category.slug} value={category.slug}>
                    {category.name}
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
              value={selectedMarketGroupId ? 
                (marketGroups?.find(g => g.id === selectedMarketGroupId)?.question || `Market Group ${selectedMarketGroupId}`) : 
                searchQuery
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
                if (relatedTarget && relatedTarget.closest('.market-group-dropdown')) {
                  return; // Don't hide dropdown if clicking inside it
                }
                // Delay hiding to allow clicking on dropdown items
                setTimeout(() => setShowMarketGroupDropdown(false), 200);
              }}
              onKeyDown={(e) => {
                if (!showMarketGroupDropdown || !filteredMarketGroups.length) return;
                
                switch (e.key) {
                  case 'ArrowDown':
                    e.preventDefault();
                    setSelectedDropdownIndex(prev => 
                      prev < filteredMarketGroups.length - 1 ? prev + 1 : 0
                    );
                    break;
                  case 'ArrowUp':
                    e.preventDefault();
                    setSelectedDropdownIndex(prev => 
                      prev > 0 ? prev - 1 : filteredMarketGroups.length - 1
                    );
                    break;
                  case 'Enter':
                    e.preventDefault();
                    if (selectedDropdownIndex >= 0 && selectedDropdownIndex < filteredMarketGroups.length) {
                      const selectedGroup = filteredMarketGroups[selectedDropdownIndex];
                      setSelectedMarketGroupId(selectedGroup.id);
                      setShowMarketGroupDropdown(false);
                      setSelectedDropdownIndex(-1);
                    }
                    break;
                  case 'Escape':
                    setShowMarketGroupDropdown(false);
                    setSelectedDropdownIndex(-1);
                    break;
                }
              }}
              placeholder={selectedMarketGroupId ? "Market group selected" : "Search by question or market name..."}
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
                onMouseDown={(e) => {
                  // Prevent the input from losing focus when clicking inside dropdown
                  e.preventDefault();
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
                      console.log('Market group selected:', group.id, group.question);
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
            {showMarketGroupDropdown && searchQuery && filteredMarketGroups.length === 0 && (
              <div 
                className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground market-group-dropdown"
                onMouseDown={(e) => {
                  // Prevent the input from losing focus when clicking inside dropdown
                  e.preventDefault();
                }}
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
                    const selectedGroup = marketGroups?.find(group => group.id === selectedMarketGroupId);
                    if (!selectedGroup) return null;
                    
                    if (selectedGroup.markets.length === 0) {
                      return (
                        <SelectItem value="no-markets" disabled>
                          No markets found
                        </SelectItem>
                      );
                    }
                    
                    return selectedGroup.markets.map((market) => (
                      <SelectItem key={market.id} value={market.id}>
                        {market.optionName || market.question || `Market ${market.marketId}`}
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
                <Label className="text-xs font-medium">Copy Market Group Parameters</Label>
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
                  <span className="font-medium">Always:</span> Market question, option name, prices, claim statement, rules (if any of these are present in the database)
                </div>
                {copyMarketGroupParams && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Also:</span> Market group question, category, index, base/quote token names, and advanced configuration
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
                    : 'Copy Market Parameters Only'
                  }
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
