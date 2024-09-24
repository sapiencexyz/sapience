import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Image,
  Link,
  Box,
  Spinner,
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
    return (
      <Box textAlign="center" py={12}>
        <Spinner opacity={0.5} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" py={12}>
        Error: {error.message}
      </Box>
    );
  }
/*
  // get chain from market context provider

  const txHash = row.event.logData.transactionHash;
  // get transaction link from etherscan, use viem chains to find the blocker explorer url
  const txLink = `${chain?.blockExplorers?.default.url}/tx/${txHash}`;
*/
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
            <Th />
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
                <NumberDisplay value={row.tradeRatioD18 || 0} />
              </Td>
              <Td>
                <Link isExternal href={`https://sepolia.etherscan.io/tx/${row.event.logData.transactionHash}`}>
                <Image 
                  src="/etherscan.svg" 
                  alt="Etherscan" 
                  width={5} 
                  height={5} 
                  opacity={0.85}

                />
                </Link>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TransactionTable;
