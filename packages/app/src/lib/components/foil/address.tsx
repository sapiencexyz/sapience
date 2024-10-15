import { Link, Text } from '@chakra-ui/react';
import { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

interface AddressProps {
  value: string;
}

const Address: React.FC<AddressProps> = ({ value }) => {
  const { chain } = useContext(MarketContext);

  const shortenAddress = (address: string) => {
    return address ? `${address.slice(0, 6)}....${address.slice(-4)}` : '';
  };

  const etherscanUrl = `${chain?.blockExplorers?.default.url}/address/${value}`;

  return (
    <Link href={etherscanUrl} textDecoration="underline" isExternal>
      <Text as="span">{shortenAddress(value)}</Text>
    </Link>
  );
};

export default Address;
