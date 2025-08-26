import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Loader2, ArrowRightIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { isAddress } from 'viem';

import { mainnetClient } from '~/lib/utils/util';

interface WalletAddressPopoverProps {
  onWalletSelect: (address: string | null) => void;
  selectedAddress: string;
  trigger: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  side?: 'top' | 'bottom';
}

const WalletAddressPopover = ({
  onWalletSelect,
  selectedAddress,
  trigger,
  isOpen,
  setIsOpen,
  side = 'top',
}: WalletAddressPopoverProps) => {
  const [inputAddress, setInputAddress] = useState<string>(
    selectedAddress || ''
  );
  const [addressError, setAddressError] = useState<string>('');
  const [isResolvingEns, setIsResolvingEns] = useState(false);

  useEffect(() => {
    setInputAddress(selectedAddress);
  }, [selectedAddress]);

  const handleWalletSubmit = async () => {
    if (!inputAddress) {
      setAddressError('Address is required');
      return;
    }

    let resolvedAddress = inputAddress;

    // If it's not already a valid address, try to resolve it as ENS
    if (!isAddress(inputAddress)) {
      if (inputAddress.endsWith('.eth')) {
        try {
          setIsResolvingEns(true);
          const ensAddress = await mainnetClient.getEnsAddress({
            name: inputAddress,
          });

          if (!ensAddress) {
            setAddressError('Could not resolve ENS address');
            return;
          }

          resolvedAddress = ensAddress;
        } catch (_error) {
          setAddressError('Error resolving ENS address');
          return;
        } finally {
          setIsResolvingEns(false);
        }
      } else {
        setAddressError('Invalid Ethereum address');
        return;
      }
    }

    setAddressError('');
    setIsOpen(false);
    onWalletSelect(resolvedAddress);
  };

  const handleWalletInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAddress(e.target.value);
    setAddressError(''); // Clear error when input changes
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" side={side} align="end" sideOffset={4}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleWalletSubmit();
          }}
        >
          <div className="grid gap-4">
            <div className="flex-1">
              <div className="relative">
                <Input
                  id="wallet"
                  data-1p-ignore
                  value={inputAddress}
                  onChange={handleWalletInputChange}
                  placeholder="0x... or .eth address"
                  className={`pr-[70px] ${addressError ? 'border-red-500' : ''}`}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  disabled={isResolvingEns}
                  size="sm"
                  className="absolute right-[1px] top-[1px] h-[calc(100%-2px)] rounded-l-none"
                >
                  {isResolvingEns ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>...</span>
                    </div>
                  ) : (
                    <ArrowRightIcon className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {addressError && (
                <p className="text-sm text-red-500 mt-1">{addressError}</p>
              )}
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};

export default WalletAddressPopover;
