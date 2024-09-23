import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Text,
  Link,
} from '@chakra-ui/react';
import { formatDistanceToNow } from 'date-fns';
import type React from 'react';
import { useMemo } from 'react';

import NumberDisplay from './numberDisplay';

interface Props {
  isLoading: boolean;
  error: Error | null;
  transactions: any[];
  contractId: string;
}

const TransactionTable: React.FC<Props> = ({
  isLoading,
  error,
  transactions,
  contractId,
}) => {
  const sortedTransactions = useMemo(() => {
    if (!transactions) return [];
    return [...transactions].sort(
      (a, b) => b.event.timestamp - a.event.timestamp
    );
  }, [transactions]);

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
            <Th>Time</Th>
            <Th>Position</Th>
            <Th>Type</Th>
            <Th>Collateral</Th>
            <Th>Ggas</Th>
            <Th>wstETH</Th>
            <Th>Price</Th>
          </Tr>
        </Thead>
        <Tbody>
          {sortedTransactions.map((row: any) => (
            <Tr key={row.id}>
              <Td>
                {formatDistanceToNow(new Date(row.event.timestamp * 1000), {
                  addSuffix: true,
                })}
              </Td>
              <Td>
                <Link
                  href={`/markets/${contractId}/positions/${row.position.positionId}`}
                >
                  #{row.position.positionId}
                </Link>
              </Td>
              <Td>{row.type}</Td>
              <Td>
                <NumberDisplay value={row.collateralDelta} />
              </Td>
              <Td>
                <NumberDisplay value={row.baseTokenDelta} />
              </Td>
              <Td>
                <NumberDisplay value={row.quoteTokenDelta} />
              </Td>
              <Td>
                {row.type === 'long' || row.type === 'short' ? (
                  <NumberDisplay value={row.tradeRatioD18} />
                ) : (
                  <Text color="gray.500">N/A</Text>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TransactionTable;
