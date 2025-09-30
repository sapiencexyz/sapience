'use client';

import { useState, useEffect } from 'react';
import { Input } from '@sapience/ui/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { isAddress } from 'viem';
import { mainnetClient } from '~/lib/utils/util';

interface AddressFilterProps {
  selectedAddress: string | null;
  onAddressChange: (address: string | null) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

const AddressFilter = ({
  selectedAddress,
  onAddressChange,
  placeholder = 'Enter address or ENS...',
  className = '',
  inputClassName = '',
}: AddressFilterProps) => {
  const [inputValue, setInputValue] = useState('');
  // Live filter state is driven directly by inputValue; we resolve ENS on the fly
  const [isResolving, setIsResolving] = useState(false);
  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  // Update input value when selectedAddress changes (only from external sources)
  useEffect(() => {
    if (!isInternalUpdate) {
      if (selectedAddress) {
        setInputValue(selectedAddress);
      } else {
        setInputValue('');
      }
    }
    setIsInternalUpdate(false);
  }, [selectedAddress]);

  // Live filtering effect: apply onAddressChange as the user types
  useEffect(() => {
    const value = inputValue.trim();
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!value) {
      setIsInternalUpdate(true);
      onAddressChange(null);
      setIsResolving(false);
    } else if (isAddress(value)) {
      setIsInternalUpdate(true);
      onAddressChange(value);
      setIsResolving(false);
    } else if (value.endsWith('.eth')) {
      setIsResolving(true);
      timer = setTimeout(async () => {
        try {
          const ensAddress = await mainnetClient.getEnsAddress({ name: value });
          setIsInternalUpdate(true);
          onAddressChange(ensAddress ?? null);
        } catch (_e) {
          // Swallow errors during live resolution; treat as no filter
          setIsInternalUpdate(true);
          onAddressChange(null);
        } finally {
          setIsResolving(false);
        }
      }, 400);
    } else {
      // Not a valid address nor an ENS; don't filter
      setIsInternalUpdate(true);
      onAddressChange(null);
      setIsResolving(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [inputValue, onAddressChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleClear = () => {
    setInputValue('');
    setIsInternalUpdate(true);
    onAddressChange(null);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none"
          aria-hidden="true"
        />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`pl-8 pr-10 w-full ${inputClassName}`}
        />
        {inputValue && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="Clear input"
          >
            &#10005;
          </button>
        )}
      </div>
      {isResolving && (
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Resolving ENS...</span>
        </div>
      )}
    </div>
  );
};

export default AddressFilter;
