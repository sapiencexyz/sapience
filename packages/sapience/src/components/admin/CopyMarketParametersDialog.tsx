'use client';

import { Button, Input, Label } from '@sapience/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { Switch } from '@sapience/ui/components/ui/switch';
import { Copy, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useEnrichedMarketGroups } from '../../hooks/graphql/useMarketGroups';
import { TICK_SPACING } from '../../lib/constants/numbers';
import { tickToPrice } from '../../lib/utils/tickUtils';
import { priceToSqrtPriceX96 } from '../../lib/utils/util';
import type { MarketInput } from './MarketFormFields';

interface CopyMarketParametersDialogProps {
  market: MarketInput;
  onMarketChange: (field: keyof MarketInput, value: string) => void;
  onMarketGroupChange?: (field: string, value: string) => void;
  onAdvancedConfigChange?: (field: string, value: string) => void;
}

interface MarketCopyData {
  question?: string | null;
  optionName?: string | null;
  baseAssetMinPriceTick?: number | null;
  baseAssetMaxPriceTick?: number | null;
  rules?: string | null;
  claimStatementYesOrNumeric?: string | null;
  claimStatementNo?: string | null;
}

interface MarketGroupCopyData {
  question?: string | null;
  category?: {
    slug?: string | null;
    id?: string | number | null;
    name?: string | null;
  } | null;
  resource?: {
    id?: string | number | null;
  } | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  owner?: string | null;
  minTradeSize?: string | null;
  marketParams?: {
    feeRate?: number | null;
    assertionLiveness?: string | null;
    bondAmount?: string | null;
    bondCurrency?: string | null;
    uniswapPositionManager?: string | null;
    uniswapSwapRouter?: string | null;
    uniswapQuoter?: string | null;
    optimisticOracleV3?: string | null;
  } | null;
}

const CopyMarketParametersDialog = ({
  onMarketChange,
  onMarketGroupChange,
  onAdvancedConfigChange,
}: CopyMarketParametersDialogProps) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [copyMarketGroupParams, setCopyMarketGroupParams] =
    useState<boolean>(false);

  // Market selection state
  const [selectedMarketGroupId, setSelectedMarketGroupId] =
    useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMarketGroupDropdown, setShowMarketGroupDropdown] =
    useState<boolean>(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] =
    useState<number>(-1);

  // Fetch available market groups
  const { data: marketGroups } = useEnrichedMarketGroups();

  // Filter market groups by category and search query
  const filteredMarketGroups = useMemo(() => {
    if (!marketGroups) return [];

    return marketGroups.filter((group) => {
      if (categoryFilter !== 'all' && group.category?.slug !== categoryFilter) {
        return false;
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const question = group.question?.toLowerCase() || '';
        const hasMatchingQuestion = question.includes(query);

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
    if (!marketGroups)
      return [] as Array<{ id: string; name: string; slug: string }>;

    const categories = new Map<
      string,
      { id: string; name: string; slug: string }
    >();

    marketGroups.forEach((group) => {
      if (group.category) {
        categories.set(group.category.slug, {
          id: group.category.id.toString(),
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

  // Reset market selection when filters change
  useEffect(() => {
    setSelectedMarketGroupId('');
    setSelectedMarketId('');
  }, [categoryFilter, searchQuery]);

  const decodeClaimStatement = (claimStatement: string): string => {
    if (!claimStatement) return '';
    if (claimStatement.startsWith('0x') && claimStatement.length > 2) {
      try {
        const hexString = claimStatement.slice(2);
        const bytes = new Uint8Array(
          hexString.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );
        return new TextDecoder('utf-8').decode(bytes);
      } catch (decodeError) {
        console.error('Failed to decode hex claim statement:', decodeError);
        return claimStatement;
      }
    }
    return claimStatement;
  };

  const copyMarketBasicData = (selectedMarket: MarketCopyData) => {
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

    onMarketChange('marketQuestion', selectedMarket.question || '');
    onMarketChange('optionName', selectedMarket.optionName || '');

    const currentTimePlusOneMinute = Math.floor(Date.now() / 1000) + 60;
    onMarketChange('startTime', currentTimePlusOneMinute.toString());
    onMarketChange('endTime', '');

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

    if (selectedMarketGroup.question) {
      onMarketGroupChange('question', selectedMarketGroup.question);
    }

    if (selectedMarketGroup.category?.slug) {
      onMarketGroupChange('category', selectedMarketGroup.category.slug);
    } else if (selectedMarketGroup.category?.id) {
      onMarketGroupChange(
        'category',
        selectedMarketGroup.category.id.toString()
      );
    }

    if (selectedMarketGroup.resource?.id) {
      onMarketGroupChange(
        'resourceId',
        selectedMarketGroup.resource.id.toString()
      );
    } else {
      onMarketGroupChange('resourceId', 'none');
    }

    if (selectedMarketGroup.baseTokenName) {
      onMarketGroupChange('baseTokenName', selectedMarketGroup.baseTokenName);
    }
    if (selectedMarketGroup.quoteTokenName) {
      onMarketGroupChange('quoteTokenName', selectedMarketGroup.quoteTokenName);
    }
  };

  const copyAdvancedConfig = (selectedMarketGroup: MarketGroupCopyData) => {
    if (!onAdvancedConfigChange) return;

    if (selectedMarketGroup.owner) {
      onAdvancedConfigChange('owner', selectedMarketGroup.owner);
    }
    if (selectedMarketGroup.minTradeSize) {
      onAdvancedConfigChange('minTradeSize', selectedMarketGroup.minTradeSize);
    }

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
        (group) => group.id.toString() === selectedMarketGroupId
      );
      if (!selectedMarketGroup) return;

      const selectedMarket = selectedMarketGroup.markets.find(
        (marketItem) => marketItem.id.toString() === selectedMarketId
      );
      if (!selectedMarket) return;

      const { minPrice, maxPrice } = copyMarketBasicData(
        selectedMarket as unknown as MarketCopyData
      );

      copyMarketGroupData(
        selectedMarketGroup as unknown as MarketGroupCopyData
      );
      copyAdvancedConfig(selectedMarketGroup as unknown as MarketGroupCopyData);

      if (selectedMarket.rules) {
        onMarketChange('rules', selectedMarket.rules);
      }

      if (minPrice !== '' && maxPrice !== '') {
        const min = Number(minPrice);
        const max = Number(maxPrice);
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          const startingPrice = ((min + max) / 2).toString();
          onMarketChange('startingPrice', startingPrice);
          onMarketChange(
            'startingSqrtPriceX96',
            priceToSqrtPriceX96(Number(startingPrice)).toString()
          );
        }
      }

      let claimStatementYesOrNumeric = '';
      if (selectedMarket.claimStatementYesOrNumeric) {
        claimStatementYesOrNumeric = selectedMarket.claimStatementYesOrNumeric;
      }
      if (claimStatementYesOrNumeric) {
        const decodedClaimStatement = decodeClaimStatement(
          claimStatementYesOrNumeric
        );
        onMarketChange('claimStatementYesOrNumeric', decodedClaimStatement);
      }

      let claimStatementNo = '';
      if (selectedMarket.claimStatementNo) {
        claimStatementNo = selectedMarket.claimStatementNo;
      }
      if (claimStatementNo) {
        const decodedClaimStatement = decodeClaimStatement(claimStatementNo);
        onMarketChange('claimStatementNo', decodedClaimStatement);
      }

      setSelectedMarketGroupId('');
      setSelectedMarketId('');
      setCategoryFilter('all');
      setSearchQuery('');
      setOpen(false);
    } catch (copyError) {
      console.error('Error copying market parameters:', copyError);
      setError('Failed to copy market parameters. Please try again.');
    } finally {
      setIsLoadingMarkets(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-3 py-1 text-sm rounded bg-secondary"
        >
          Copy From Existing
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Copy Market Parameters</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            {error && <div className="text-sm text-red-500 mb-2">{error}</div>}
            <div className="flex items-center gap-2 mb-3">
              <Copy className="h-4 w-4" />
              <Label className="text-sm font-medium">
                Copy from Existing Market
              </Label>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor={'cmpd-categoryFilter'} className="text-xs">
                  Filter by Category
                </Label>
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger id={'cmpd-categoryFilter'} className="h-9">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {availableCategories.map((categoryItem) => (
                      <SelectItem
                        key={categoryItem.slug}
                        value={categoryItem.slug}
                      >
                        {categoryItem.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Label htmlFor={'cmpd-searchQuery'} className="text-xs">
                  Search Markets
                </Label>
                <Input
                  id={'cmpd-searchQuery'}
                  type="text"
                  value={
                    selectedMarketGroupId
                      ? marketGroups?.find(
                          (g) => g.id.toString() === selectedMarketGroupId
                        )?.question || `Market Group ${selectedMarketGroupId}`
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
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (
                      relatedTarget &&
                      relatedTarget.closest('.market-group-dropdown')
                    ) {
                      return;
                    }
                    setTimeout(() => setShowMarketGroupDropdown(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (
                      !showMarketGroupDropdown ||
                      !filteredMarketGroups.length
                    )
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
                          setSelectedMarketGroupId(selectedGroup.id.toString());
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

                {showMarketGroupDropdown && filteredMarketGroups.length > 0 && (
                  <div
                    className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto market-group-dropdown"
                    role="listbox"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onKeyDown={(e) => {
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
                        className={`w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none text-sm border-b border-border last:border-b-0 ${index === selectedDropdownIndex ? 'bg-muted' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onMouseEnter={() => setSelectedDropdownIndex(index)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedMarketGroupId(group.id.toString());
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

              {selectedMarketGroupId && (
                <div>
                  <Label htmlFor={'cmpd-marketSelect'} className="text-xs">
                    Market
                  </Label>
                  <Select
                    value={selectedMarketId}
                    onValueChange={setSelectedMarketId}
                    disabled={!selectedMarketGroupId}
                  >
                    <SelectTrigger id={'cmpd-marketSelect'} className="h-9">
                      <SelectValue placeholder="Select a market" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedGroup = marketGroups?.find(
                          (group) =>
                            group.id.toString() === selectedMarketGroupId
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
                          <SelectItem
                            key={marketItem.id}
                            value={marketItem.id.toString()}
                          >
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
                    id={'cmpd-copyMarketGroupParams'}
                  />
                </div>
              )}

              {selectedMarketGroupId && selectedMarketId && (
                <div className="p-3 bg-muted/50 rounded-md border">
                  <p className="text-xs font-medium mb-2">
                    What will be copied:
                  </p>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Always:</span> Market
                      question, option name, prices, claim statement, rules (if
                      any of these are present in the database)
                    </div>
                    {copyMarketGroupParams && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Also:</span> Market group
                        question, category, index, base/quote token names, and
                        advanced configuration (excluding Chain ID, Factory
                        Address, and Collateral Asset)
                      </div>
                    )}
                  </div>
                </div>
              )}

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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CopyMarketParametersDialog;
