import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Link,
  Box,
  Spinner,
} from '@chakra-ui/react';

import NumberDisplay from './numberDisplay';

interface Props {
  isLoading: boolean;
  error: Error | null;
  positions: any[];
  contractId: string;
}
const LiquidityPositionsTable: React.FC<Props> = ({
  isLoading,
  error,
  positions,
  contractId,
}) => {
  console.log('positions = ', positions);

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

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Position</Th>
            <Th>Collateral</Th>
            <Th>Base Token</Th>
            <Th>Quote Token</Th>
            {/* <Th>Net Position</Th> */}
            {/* <Th>Gain/Loss</Th> */}
            <Th>High Price</Th>
            <Th>Low Price</Th>
            {/* <Th>Unclaimed Fees</Th> */}
          </Tr>
        </Thead>
        <Tbody>
          {positions &&
            positions.map((row: any) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    href={`/markets/${contractId}/positions/${row.positionId}`}
                  >
                    #{row.positionId.toString()}
                  </Link>
                </Td>
                <Td>
                  <NumberDisplay value={row.collateral} /> wstETH
                </Td>
                <Td>
                  <NumberDisplay value={row.baseToken} /> Ggas
                </Td>
                <Td>
                  <NumberDisplay value={row.quoteToken} /> wstETH
                </Td>
                {/* <Td>TODO</Td> */}
                {/* <Td>{row.profitLoss.toString()}</Td> */}
                <Td>
                  <NumberDisplay value={row.highPrice} /> Ggas/wstETH
                </Td>
                <Td>
                  <NumberDisplay value={row.lowPrice} /> Ggas/wstETH
                </Td>
                {/* <Td>{row.unclaimedFees.toString()}</Td> */}
              </Tr>
            ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default LiquidityPositionsTable;
