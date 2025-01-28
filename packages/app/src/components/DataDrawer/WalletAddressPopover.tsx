import { Loader2, WalletIcon, ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';

import { mainnetClient } from '~/app/providers';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { ToggleGroupItem } from '~/components/ui/toggle-group';

interface WalletAddressPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onWalletSelect: (address: string) => void;
  selectedAddress: string;
}

const WalletAddressPopover = ({
  isOpen,
  onOpenChange,
  onWalletSelect,
  selectedAddress,
}: WalletAddressPopoverProps) => {
  const { address } = useAccount();
  const [inputAddress, setInputAddress] = useState<string>(address || '');
  const [addressError, setAddressError] = useState<string>('');
  const [isResolvingEns, setIsResolvingEns] = useState(false);

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

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
        } catch (error) {
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
    onOpenChange(false);
    onWalletSelect(resolvedAddress);
  };

  const handleWalletInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAddress(e.target.value);
    setAddressError(''); // Clear error when input changes
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ToggleGroupItem value="wallet">
          <WalletIcon className="w-4 h-4" />
          {selectedAddress ? truncateAddress(selectedAddress) : 'Select Wallet'}
        </ToggleGroupItem>
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="end" sideOffset={4}>
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
