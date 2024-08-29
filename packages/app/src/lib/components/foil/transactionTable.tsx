import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@chakra-ui/react';
import type { Transaction } from '@data/entity/Transaction';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';

export default function TransactoinTable() {
  const { chainId, address, epoch } = useContext(MarketContext);
  const contractId = `${chainId}:${address}`;
  const useTransactions = () => {
    return useQuery({
      queryKey: ['transactions', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/transactions?contractId=${contractId}&epochId=${epoch}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000, // Refetch every 60 seconds
    });
  };

  const { data: transactions, error, isLoading } = useTransactions();
  console.log('transactions = ', transactions);

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
            <Th>Position ID</Th>
            <Th>Collateral Change</Th>
            <Th>Base Token Change</Th>
            <Th>Quote Token Change</Th>
            <Th>Type</Th>
          </Tr>
        </Thead>
        <Tbody>
          {transactions &&
            transactions.map((row: Transaction) => (
              <Tr key={row.id}>
                <Td>{row.position.positionId}</Td>
                <Td>{row.collateralDelta}</Td>
                <Td>{row.baseTokenDelta}</Td>
                <Td>{row.quoteTokenDelta}</Td>
                <Td>{row.type}</Td>
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
