import { Button } from '@foil/ui/components/ui/button';
import { ChartColumnIncreasingIcon } from 'lucide-react';

import WalletAddressPopover from './WalletAddressPopover';

interface DataDrawerFilterProps {
  address: string | null;
  onAddressChange: (address: string | null) => void;
}

const DataDrawerFilter = ({
  address,
  onAddressChange,
}: DataDrawerFilterProps) => {
  const selectedView = address ? 'wallet' : 'market';

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        onClick={() => onAddressChange(null)}
        className={`flex items-center gap-2 ${selectedView === 'market' ? 'bg-secondary' : ''}`}
      >
        <ChartColumnIncreasingIcon className="w-4 h-4" /> All Period Data
      </Button>
      <WalletAddressPopover
        onWalletSelect={onAddressChange}
        selectedAddress={address || ''}
      />
    </div>
  );
};

export default DataDrawerFilter;
