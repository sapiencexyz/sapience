import { CheckIcon, QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Link,
  Tooltip,
} from '@chakra-ui/react';
import type React from 'react';
import { useContext } from 'react';

import { MarketContext } from '../../context/MarketProvider';

import Address from './address';
import NumberDisplay from './numberDisplay';

interface Props {
  positions: any[];
}
const TraderPositionsTable: React.FC<Props> = ({ positions }) => {
  const { address, chain, endTime, pool } = useContext(MarketContext);
  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

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
            {expired ? <Th>Settled</Th> : null}
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
                      href={`/positions/${chain}:${address}/${row.positionId}`}
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
                  {expired ? (
                    <Td>
                      {row.isSettled ? (
                        <CheckIcon color="green.500" mr={2} />
                      ) : null}
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TraderPositionsTable;
