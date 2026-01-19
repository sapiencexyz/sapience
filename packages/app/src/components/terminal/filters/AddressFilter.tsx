'use client';

import type React from 'react';
import { useCallback, useDeferredValue, useState } from 'react';
import MultiSelect, { type MultiSelectItem } from './MultiSelect';
import { Input } from '@sapience/ui/components/ui/input';

const truncateAddress = (address: string) =>
  address.length > 10
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

const isValidAddress = (address: string): boolean => {
  // Basic ethereum address validation (0x followed by 40 hex chars)
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

type Props = {
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
};

const AddressFilter: React.FC<Props> = ({ items, selected, onChange }) => {
  const deferredItems = useDeferredValue(items);
  const deferredSelected = useDeferredValue(selected);

  const [inputValue, setInputValue] = useState('');

  const handleAddAddress = useCallback(() => {
    const trimmed = inputValue.trim();
    if (isValidAddress(trimmed) && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setInputValue('');
    }
  }, [inputValue, selected, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddAddress();
      }
    },
    [handleAddAddress]
  );

  const renderHeader = useCallback(
    ({
      selected: sel,
      onChange: onChangeSelected,
    }: {
      selected: string[];
      onChange: (values: string[]) => void;
    }) => (
      <div className="relative border-b border-border">
        <Input
          inputSize="xs"
          type="text"
          placeholder="Enter address…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border-0 rounded-none bg-transparent font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0 pr-16"
        />
        {inputValue.trim() && (
          <button
            type="button"
            onClick={handleAddAddress}
            disabled={!isValidAddress(inputValue.trim())}
            className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ADD
          </button>
        )}
        {sel.length > 0 && !inputValue.trim() && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeSelected([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            CLEAR
          </button>
        )}
      </div>
    ),
    [inputValue, handleKeyDown, handleAddAddress]
  );

  return (
    <MultiSelect
      placeholder="All Predictors"
      items={deferredItems}
      selected={deferredSelected}
      onChange={onChange}
      emptyMessage="No predictors found"
      renderHeader={renderHeader}
      renderItemContent={(item) => (
        <span className="font-mono text-xs text-brand-white">
          {truncateAddress(item.value)}
        </span>
      )}
      renderTriggerContent={(sel) => {
        if (sel.length === 0) return null;
        if (sel.length === 1) {
          return (
            <span className="font-mono text-xs">{truncateAddress(sel[0])}</span>
          );
        }
        return `${sel.length} predictors`;
      }}
    />
  );
};

export default AddressFilter;
