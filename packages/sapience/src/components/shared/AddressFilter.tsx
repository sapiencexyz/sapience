'use client';

import { useState, useEffect } from 'react';
import { Input } from '@sapience/ui/components/ui/input';
import { Button } from '@sapience/ui/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { isAddress } from 'viem';
import { mainnetClient } from '~/lib/utils/util';

interface AddressFilterProps {
  selectedAddress: string | null;
  onAddressChange: (address: string | null) => void;
  placeholder?: string;
  className?: string;
}

const AddressFilter = ({
  selectedAddress,
  onAddressChange,
  placeholder = 'Enter address or ENS...',
  className = '',
}: AddressFilterProps) => {
  const [inputValue, setInputValue] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  // Update input value when selectedAddress changes (only from external sources)
  useEffect(() => {
    if (!isInternalUpdate && selectedAddress) {
      // If selectedAddress is an ENS, keep the display value as the ENS, but inputValue and resolvedAddress as the address
      setInputValue(selectedAddress);
      setDisplayValue(selectedAddress);
      if (!isAddress(selectedAddress) && selectedAddress.endsWith('.eth')) {
        // Resolve ENS and call onAddressChange with the resolved address
        (async () => {
          setIsResolving(true);
          setError(null);
          try {
            const ensAddress = await mainnetClient.getEnsAddress({
              name: selectedAddress,
            });
            if (ensAddress && ensAddress !== resolvedAddress) {
              setResolvedAddress(ensAddress);
              setIsInternalUpdate(true);
              onAddressChange(ensAddress);
            }
          } catch (_e) {
            setError('Could not resolve ENS address');
          } finally {
            setIsResolving(false);
          }
        })();
      } else {
        setResolvedAddress(selectedAddress);
      }
    } else if (!isInternalUpdate && !selectedAddress) {
      setInputValue('');
      setDisplayValue('');
      setResolvedAddress(null);
    }
    setIsInternalUpdate(false);
  }, [selectedAddress]);

  const handleAddressSubmit = async () => {
    if (!inputValue.trim()) {
      setIsInternalUpdate(true);
      onAddressChange(null);
      setError(null);
      setResolvedAddress(null);
      return;
    }

    let resolvedAddr = inputValue.trim();
    let displayVal = inputValue.trim();

    // If it's not already a valid address, try to resolve it as ENS
    if (!isAddress(inputValue.trim())) {
      if (inputValue.trim().endsWith('.eth')) {
        try {
          setIsResolving(true);
          setError(null);
          const ensAddress = await mainnetClient.getEnsAddress({
            name: inputValue.trim(),
          });

          if (!ensAddress) {
            setError('Could not resolve ENS address');
            return;
          }

          resolvedAddr = ensAddress;
          // Keep the original ENS input for display, but store resolved address
          displayVal = inputValue.trim();
          setDisplayValue(displayVal);
          setResolvedAddress(resolvedAddr);
          setError(null);
          setIsInternalUpdate(true);
          onAddressChange(resolvedAddr); // Always pass resolved address
          return;
        } catch (_error) {
          setError('Error resolving ENS address');
          return;
        } finally {
          setIsResolving(false);
        }
      } else {
        setError('Invalid Ethereum address or ENS name');
        return;
      }
    } else {
      // For regular addresses, display and resolve are the same
      setDisplayValue(displayVal);
      setResolvedAddress(resolvedAddr);
      setError(null);
      setIsInternalUpdate(true);
      onAddressChange(resolvedAddr);
      return;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setError(null);
  };

  const handleClear = () => {
    setInputValue('');
    setDisplayValue('');
    setResolvedAddress(null);
    setError(null);
    setIsInternalUpdate(true);
    onAddressChange(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddressSubmit();
    }
  };

  return (
    <div className={`relative px-2 ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className={`pl-10 h-12 text-base pr-10 ${error ? 'border-red-500' : ''}`}
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
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      {isResolving && (
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Resolving ENS...</span>
        </div>
      )}
      {resolvedAddress && !error && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {displayValue}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default AddressFilter;
