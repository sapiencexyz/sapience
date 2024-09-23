import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Link,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import type React from 'react';

import NumberDisplay from './numberDisplay';

interface Props {
  isLoading: boolean;
  error: Error | null;
  positions: any[];
}
const TraderPositionsTable: React.FC<Props> = ({
  isLoading,
  error,
  positions,
}) => {
  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>ID</Th>
            <Th>Collateral</Th>
            <Th>Size</Th>
          </Tr>
        </Thead>
        <Tbody>
          {positions &&
            positions.map((row: any) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    as={NextLink}
                    href={`/markets/${row.epoch.market.chainId}:${row.epoch.market.address}/positions/${row.positionId}`}
                  >
                    #{row.positionId.toString()}
                  </Link>
                </Td>
                <Td>
                  <NumberDisplay value={row.collateral} /> wstETH
                </Td>
                <Td>
                  <NumberDisplay
                    value={row.baseToken - row.borrowedBaseToken}
                  />{' '}
                  Ggas
                </Td>
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TraderPositionsTable;
