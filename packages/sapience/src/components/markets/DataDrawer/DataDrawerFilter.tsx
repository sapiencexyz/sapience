import { Button } from '@sapience/ui/components/ui/button';
import { ChartColumnIncreasingIcon, WalletIcon } from 'lucide-react';

import { useState } from 'react';
import WalletAddressPopover from './WalletAddressPopover';
import { shortenAddress } from '~/lib/utils/util';

interface DataDrawerFilterProps {
  address: string | null;
  onAddressChange: (address: string | null) => void;
}

const DataDrawerFilter = ({
  address,
  onAddressChange,
}: DataDrawerFilterProps) => {
  const selectedView = address ? 'wallet' : 'market';
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        onClick={() => onAddressChange(null)}
        className={`flex items-center gap-2 ${selectedView === 'market' ? 'bg-secondary' : ''}`}
      >
        <ChartColumnIncreasingIcon className="w-4 h-4" /> All Market Data
      </Button>
      <WalletAddressPopover
        onWalletSelect={onAddressChange}
        selectedAddress={address || ''}
        isOpen={isPopoverOpen}
        setIsOpen={setIsPopoverOpen}
        trigger={
          <Button
            variant="outline"
            className={`flex items-center gap-2 ${address ? 'bg-secondary' : ''}`}
          >
            <WalletIcon className="w-4 h-4" />
            {address ? shortenAddress(address) : 'Select Wallet'}
          </Button>
        }
      />
    </div>
  );
};

export default DataDrawerFilter;
