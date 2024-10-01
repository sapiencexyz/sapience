import { QuestionOutlineIcon } from '@chakra-ui/icons';
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
  Tooltip,
} from '@chakra-ui/react';
import type React from 'react';
import { useContext } from 'react';

import { MarketContext } from '../../context/MarketProvider';

import NumberDisplay from './numberDisplay';

interface Props {
  isLoading: boolean;
  error: Error | null;
  positions: any[];
  contractId: string;
}
const TraderPositionsTable: React.FC<Props> = ({
  isLoading,
  error,
  positions,
  contractId,
}) => {
  const { pool } = useContext(MarketContext);

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

  const calculatePnL = (position: any) => {
    const vEthToken = parseFloat(position.quoteToken);
    const borrowedVEth = parseFloat(position.borrowedQuoteToken);
    const vGasToken = parseFloat(position.baseToken);
    const borrowedVGas = parseFloat(position.borrowedBaseToken);
    const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');

    return vEthToken - borrowedVEth + (vGasToken - borrowedVGas) * marketPrice;
  };

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Position</Th>
            <Th>Collateral</Th>
            <Th>Size</Th>
            <Th>
              Profit/Loss{' '}
              <Tooltip label="This is an estimate that does not take into account slippage or fees.">
                <QuestionOutlineIcon transform="translateY(-1px)" />
              </Tooltip>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {positions &&
            positions.map((row: any) => {
              const pnl = calculatePnL(row);
              return (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      href={`/markets/${contractId}/positions/${row.positionId}`}
                      textDecoration="underline"
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
                  <Td>
                    <NumberDisplay value={pnl} /> wstETH
                  </Td>
                </Tr>
              );
            })}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TraderPositionsTable;
