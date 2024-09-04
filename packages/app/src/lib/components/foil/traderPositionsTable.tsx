import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@chakra-ui/react';
import React from 'react';

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
  console.log('trade positions = ', positions);

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>ID</Th>
            <Th>Collateral</Th>
            <Th>Base Token</Th>
            <Th>Quote Token</Th>
            {/* <Th>Net Position</Th> */}
            {/* <Th>Gain/Loss</Th> */}
          </Tr>
        </Thead>
        <Tbody>
          {positions &&
            positions.map((row: any) => (
              <Tr key={row.id}>
                <Td>#{row.positionId.toString()}</Td>
                <Td>{row.collateral.toString()} wstETH</Td>
                <Td>{row.baseToken.toString()} Ggas</Td>
                <Td>{row.quoteToken.toString()} wstETH</Td>
                {/* <Td>TODO</Td> */}
                {/* <Td>{row.profitLoss.toString()}</Td> */}
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TraderPositionsTable;
