import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';

export default function TraderPositionsTable() {
  const { address, chainId } = useContext(MarketContext);
  const contractId = `${chainId}:${address}`;
  const usePositions = () => {
    return useQuery({
      queryKey: ['traderPositions', contractId],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/positions?contractId=${contractId}&isLP=false`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000, // Refetch every 60 seconds
    });
  };

  const {
    data: positions,
    error,
    isLoading,
  }: {
    data: any;
    error: any;
    isLoading: boolean;
  } = usePositions();

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
                <Td>{row.positionId.toString()}</Td>
                <Td>{row.collateral.toString()}</Td>
                <Td>{row.baseToken.toString()}</Td>
                <Td>{row.quoteToken.toString()}</Td>
                {/* <Td>TODO</Td> */}
                {/* <Td>{row.profitLoss.toString()}</Td> */}
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
