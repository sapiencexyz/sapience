'use client';

import { Input } from '@sapience/ui/components/ui/input';
import { Search } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { CommentFilters } from './Comments';
import QuestionItem from './QuestionItem';
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
  setSelectedCategory?: (category: CommentFilters | null) => void;
}

const QuestionSelect = ({
  className,
  selectedMarketGroup,
  onMarketGroupSelect,
  selectedCategory,
  marketMode = false,
  markets = [],
  selectedMarketId,
  setSelectedCategory,
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
          (m) => m.id?.toString() === selectedMarketId
        );

        // For multiple choice markets, show the market group question instead of option name
        let displayValue = '';
        if (selected) {
          const isMultipleChoice = selected.group?.marketClassification === '1';
          if (isMultipleChoice) {
            displayValue = selected.question || selected?.group?.question || '';
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
      setLastSelected({ id: item.id?.toString() });
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
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setInputValue('');
              onMarketGroupSelect?.(undefined);
              setSelectedCategory?.(null);
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
          className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {/* Market mode dropdown */}
          {marketMode ? (
            filteredMarketGroups.length > 0 ? (
              <div>
                {filteredMarketGroups.map((market) => (
                  <QuestionItem
                    key={market.id}
                    item={market}
                    onClick={handleSelect}
                    isSelected={selectedMarketId === market.id?.toString()}
                    showBorder={true}
                  />
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
                <QuestionItem
                  key={marketGroup.id}
                  item={marketGroup}
                  onClick={handleSelect}
                  showBorder={true}
                />
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
