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
import { formatUnits } from 'viem';

import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';
import { TransactionType } from '~/lib/interfaces/interfaces';

export default function TransactoinTable() {
  const { chainId, address, epoch, collateralAssetDecimals } =
    useContext(MarketContext);
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

  const getFinalPrice = (transaction: any) => {
    if (
      transaction.type === TransactionType.LONG ||
      transaction.type === TransactionType.SHORT
    ) {
      const { finalPrice } = transaction.event.logData.args;
      return formatUnits(finalPrice, collateralAssetDecimals);
    }
    return '-';
  };

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Position ID</Th>
            <Th>Type</Th>
            <Th>Collateral Change</Th>
            <Th>Base Token Change</Th>
            <Th>Quote Token Change</Th>
            {/* <Th>Price</Th> */}
          </Tr>
        </Thead>
        <Tbody>
          {transactions &&
            transactions.map((row: any) => (
              <Tr key={row.id}>
                <Td>{row.position.positionId}</Td>
                <Td>{row.type}</Td>
                <Td>{row.collateralDelta}</Td>
                <Td>{row.baseTokenDelta}</Td>
                <Td>{row.quoteTokenDelta}</Td>
                {/* <Td>{getFinalPrice(row)}</Td> */}
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
