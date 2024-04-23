import { EditIcon } from '@chakra-ui/icons';
import { Tr, Td, IconButton, Text } from '@chakra-ui/react';
import PositionEdit from './positionEdit';

export default function PositionRow(row: any) {
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
