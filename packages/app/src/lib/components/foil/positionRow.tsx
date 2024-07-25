import { Tr, Td, Text, StatNumber, Stat } from '@chakra-ui/react';
import { useReadContract } from 'wagmi';

import Foil from '../../../../deployments/Foil.json';

// import PositionEdit from './positionEdit';

export default function PositionRow(row: any) {
  const positionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getPosition',
    args: [row.id],
  });

  return (
    <Tr height="80px">
      <Td>
        {row.id.toString()}
        <Text as="span" fontSize="sm" color="gray.700" />
      </Td>
      <Td>
        {row.id === '420' ? '500' : '100'}
        {row.collateral}{' '}
        <Text as="span" fontSize="sm" color="gray.700">
          cbETH
        </Text>
      </Td>
      <Td>
        {row.id === '420' ? '0.05' : '0.1'}
        {row.lowPrice}{' '}
        <Text as="span" fontSize="sm" color="gray.700">
          cbETH/Ggas
        </Text>
      </Td>
      <Td>
        {row.id === '420' ? '0.5' : '0.1'}
        {row.highPrice}{' '}
        <Text as="span" fontSize="sm" color="gray.700">
          cbETH/Ggas
        </Text>
      </Td>
      <Td>
        {row.id === '420' ? '-250' : '+1000'}
        {row.netPosition}{' '}
        <Text as="span" fontSize="sm" color="gray.700">
          Ggas
        </Text>
      </Td>
      <Td>
        {row.id === '420' ? '-250' : '+100'}
        {row.gainLoss}{' '}
        <Text as="span" fontSize="sm" color="gray.700">
          cbETH
        </Text>
      </Td>
      <Td isNumeric>{/* <PositionEdit id={row.id} /> */}</Td>
    </Tr>
  );
}
