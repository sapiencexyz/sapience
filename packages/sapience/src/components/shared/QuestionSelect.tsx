'use client';

import { Input } from '@sapience/ui/components/ui/input';
import { Search } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';

interface QuestionSelectProps {
  className?: string;
  selectedMarketGroup?: any;
  onMarketGroupSelect?: (marketOrGroup: any) => void;
  selectedCategory?: string | null;
  // New props for market selection mode
  marketMode?: boolean;
  markets?: any[];
  selectedMarketId?: string;
}

const QuestionSelect = ({
  className,
  selectedMarketGroup,
  onMarketGroupSelect,
  selectedCategory,
  marketMode = false,
  markets = [],
  selectedMarketId,
}: QuestionSelectProps) => {
  // Track last selected id/group to avoid overwriting inputValue on every render
  const [inputValue, setInputValue] = useState('');
  const [lastSelected, setLastSelected] = useState<
    { id?: string; group?: any } | undefined
  >(undefined);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filteredMarketGroups, setFilteredMarketGroups] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch market groups (only if not in marketMode)
  const { data: marketGroups, isLoading } = useEnrichedMarketGroups();

  // Only update inputValue when selection changes
  useEffect(() => {
    if (marketMode) {
      if (selectedMarketId && lastSelected?.id !== selectedMarketId) {
        const selected = markets.find(
          (m) => m.marketId?.toString() === selectedMarketId
        );

        // For multiple choice markets, show the market group question instead of option name
        let displayValue = '';
        if (selected) {
          const isMultipleChoice = selected.group?.marketClassification === '1';
          if (isMultipleChoice) {
            displayValue = selected.group?.question || selected.question || '';
          } else {
            displayValue = selected.optionName || selected.question || '';
          }
        }

        setInputValue(displayValue);
        setLastSelected({ id: selectedMarketId });
      } else if (!selectedMarketId && lastSelected?.id) {
        setInputValue('');
        setLastSelected({ id: undefined });
      }
    } else {
      if (selectedMarketGroup && lastSelected?.group !== selectedMarketGroup) {
        setInputValue(selectedMarketGroup?.question || '');
        setLastSelected({ group: selectedMarketGroup });
      } else if (!selectedMarketGroup && lastSelected?.group) {
        setInputValue('');
        setLastSelected({ group: undefined });
      }
    }
  }, [selectedMarketGroup, selectedMarketId, marketMode, markets]);

  // Filter dropdown options
  useEffect(() => {
    if (marketMode) {
      // Filter markets
      let filtered = markets;
      if (inputValue.trim()) {
        const searchTerm = inputValue.toLowerCase();
        filtered = filtered.filter(
          (market) =>
            (market.group?.question?.toLowerCase() || '').includes(
              searchTerm
            ) ||
            (market.question?.toLowerCase() || '').includes(searchTerm) ||
            (market.optionName?.toLowerCase() || '').includes(searchTerm)
        );
      }
      setFilteredMarketGroups(filtered);
      return;
    }
    // Group mode (original)
    if (!marketGroups) {
      setFilteredMarketGroups([]);
      return;
    }
    let filtered = marketGroups;
    if (inputValue.trim()) {
      const searchTerm = inputValue.toLowerCase();
      filtered = filtered.filter((group) => {
        return (
          group.question?.toLowerCase().includes(searchTerm) ||
          group.category?.name?.toLowerCase().includes(searchTerm) ||
          group.baseTokenName?.toLowerCase().includes(searchTerm) ||
          group.quoteTokenName?.toLowerCase().includes(searchTerm)
        );
      });
    }
    setFilteredMarketGroups(filtered);
  }, [inputValue, marketGroups, selectedCategory, marketMode]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setIsDropdownOpen(true);
  };

  // Handle input blur: if input is empty, deselect
  const handleInputBlur = () => {
    // Only deselect if input is empty AND there's no current selection
    if (inputValue.trim() === '') {
      if (marketMode) {
        if (!selectedMarketId) {
          onMarketGroupSelect?.(undefined);
        }
      } else {
        if (!selectedMarketGroup) {
          onMarketGroupSelect?.(undefined);
        }
      }
    }
  };

  // Handle selection
  const handleSelect = (item: any) => {
    let displayValue = '';
    if (marketMode) {
      displayValue = item.question || item.group?.question || '';
    } else {
      displayValue = item.question || '';
    }

    setInputValue(displayValue);
    setIsDropdownOpen(false);
    // Update lastSelected to prevent useEffect from overriding the input value
    if (marketMode) {
      setLastSelected({ id: item.marketId?.toString() });
    } else {
      setLastSelected({ group: item });
    }
    onMarketGroupSelect?.(item);
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (marketMode) {
      if (markets && markets.length > 0) setIsDropdownOpen(true);
    } else {
      if (marketGroups && marketGroups.length > 0) setIsDropdownOpen(true);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <div className={`${className || ''} relative`}>
      {/* Search input always visible above dropdown */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={
            marketMode
              ? 'Search questions...'
              : 'Search questions or market groups...'
          }
          className="pl-10 h-12 text-base pr-10"
        />
        {inputValue && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setInputValue('');
              setIsDropdownOpen(true);
              onMarketGroupSelect?.(undefined);
            }}
            tabIndex={-1}
            aria-label="Clear input"
          >
            &#10005;
          </button>
        )}
      </div>
      {/* Dropdown */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {/* Market mode dropdown */}
          {marketMode ? (
            filteredMarketGroups.length > 0 ? (
              <div className="py-2">
                {filteredMarketGroups.map((market) => (
                  <button
                    key={market.id}
                    type="button"
                    className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 ${selectedMarketId === market.id?.toString() ? 'bg-primary/10' : ''}`}
                    onClick={() => handleSelect(market)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Market info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {market.question && <span>{market.question}</span>}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          {market.group?.question ||
                            market.question ||
                            `Market ${market.marketId}`}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : inputValue.trim() ? (
              <div className="p-4 text-center text-muted-foreground">
                No markets found matching "{inputValue}"
              </div>
            ) : null
          ) : // Group mode dropdown (original)
          isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading market groups...
            </div>
          ) : filteredMarketGroups.length > 0 ? (
            <div className="py-2">
              {filteredMarketGroups.map((marketGroup) => (
                <button
                  key={marketGroup.id}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                  onClick={() => handleSelect(marketGroup)}
                >
                  <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div className="flex-shrink-0 mt-1">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: `${marketGroup.category?.color || '#9CA3AF'}1A`,
                        }}
                      >
                        <div style={{ transform: 'scale(0.6)' }}>
                          <div
                            style={{
                              color: marketGroup.category?.color || '#9CA3AF',
                            }}
                            dangerouslySetInnerHTML={{
                              __html: marketGroup.category?.iconSvg || '',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Market group info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {marketGroup.question}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <span>{marketGroup.category?.name}</span>
                        {marketGroup.baseTokenName &&
                          marketGroup.quoteTokenName && (
                            <>
                              <span>•</span>
                              <span>
                                {marketGroup.baseTokenName}/
                                {marketGroup.quoteTokenName}
                              </span>
                            </>
                          )}
                        {marketGroup.markets?.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{marketGroup.markets.length} markets</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : inputValue.trim() ? (
            <div className="p-4 text-center text-muted-foreground">
              No market groups found matching "{inputValue}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default QuestionSelect;
