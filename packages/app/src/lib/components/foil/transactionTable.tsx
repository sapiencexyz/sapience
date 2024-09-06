import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@chakra-ui/react';
import { formatDistanceToNow } from 'date-fns';
import type React from 'react';
import { useContext, useMemo } from 'react';
import { formatUnits } from 'viem';

import { MarketContext } from '~/lib/context/MarketProvider';
import { TransactionType } from '~/lib/interfaces/interfaces';

interface Props {
  isLoading: boolean;
  error: Error | null;
  transactions: any[];
}

const TransactionTable: React.FC<Props> = ({
  isLoading,
  error,
  transactions,
}) => {
  const { collateralAssetDecimals } = useContext(MarketContext);

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
            <Th>Time</Th>
            <Th>Position</Th>
            <Th>Type</Th>
            <Th>Collateral Change</Th>
            <Th>Base Token Change</Th>
            <Th>Quote Token Change</Th>
            {/* <Th>Price</Th> */}
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
              <Td>#{row.position.positionId}</Td>
              <Td>{row.type}</Td>
              <Td>{row.collateralDelta} wstETH</Td>
              <Td>{row.baseTokenDelta} Ggas</Td>
              <Td>{row.quoteTokenDelta} wstETH</Td>
              {/* <Td>{getFinalPrice(row)}</Td> */}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TransactionTable;
