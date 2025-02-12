import { Loader2, WalletIcon, ArrowRightIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { mainnetClient, shortenAddress } from '~/lib/utils/util';

interface WalletAddressPopoverProps {
  onWalletSelect: (address: string | null) => void;
  selectedAddress: string;
}

const WalletAddressPopover = ({
  onWalletSelect,
  selectedAddress,
}: WalletAddressPopoverProps) => {
  const { address } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [inputAddress, setInputAddress] = useState<string>(address || '');
  const [addressError, setAddressError] = useState<string>('');
  const [isResolvingEns, setIsResolvingEns] = useState(false);

  useEffect(() => {
    if (address) {
      setInputAddress(address);
    }
  }, [address]);

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
    setIsOpen(false);
    onWalletSelect(resolvedAddress);
  };

  const handleWalletInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAddress(e.target.value);
    setAddressError(''); // Clear error when input changes
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`flex items-center gap-2 ${selectedAddress ? 'bg-secondary' : ''}`}
        >
          <WalletIcon className="w-4 h-4" />
          {selectedAddress ? shortenAddress(selectedAddress) : 'Select Wallet'}
        </Button>
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
