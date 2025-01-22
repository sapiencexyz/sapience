import type React from 'react';

import { shortenAddress, getExplorerUrl } from '~/lib/util/util';

import type { AddressCellProps } from './types';

const AddressCell: React.FC<AddressCellProps> = ({ address, chainId }) => {
  return (
    <div className="flex space-x-2">
      <a
        href={getExplorerUrl(chainId, address)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {shortenAddress(address)}
      </a>
    </div>
  );
};

export default AddressCell;
