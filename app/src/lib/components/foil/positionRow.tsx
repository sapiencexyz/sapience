import { Tr, Td, Text } from '@chakra-ui/react';
import PositionEdit from './positionEdit';
import { useReadContract } from 'wagmi';
import Foil from '../../../../deployments/Foil.json';

export default function PositionRow(row: any) {

  const positionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getPosition',
    args: [row.id],
  });

  console.log(positionResult);

  return (
    <Tr>
      <Td>{row.id.toString()}</Td>
      <Td>
        {row.collateral}{' '}
        <Text fontSize="sm" color="gray.500">
          cbETH
        </Text>
      </Td>
      <Td>
        {row.lowPrice}{' '}
        <Text fontSize="sm" color="gray.500">
          cbETH/Ggas
        </Text>
      </Td>
      <Td>
        {row.highPrice}{' '}
        <Text fontSize="sm" color="gray.500">
          cbETH/Ggas
        </Text>
      </Td>
      <Td>
        {row.netPosition}
        <Text fontSize="sm" color="gray.500">
          Gigagas
        </Text>
      </Td>
      <Td>
        {row.gainLoss}
        <Text fontSize="sm" color="gray.500">
          cbETH
        </Text>
      </Td>
      <Td isNumeric>
        <PositionEdit id={row.id} />
      </Td>
    </Tr>
  );
}
