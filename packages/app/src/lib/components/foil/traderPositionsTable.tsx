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
import { formatUnits } from 'viem';

import { MarketContext } from '../../context/MarketProvider';
import { calculatePnL } from '~/lib/util/positionUtil';
import { convertWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

interface Props {
  positions: any[];
}
const TraderPositionsTable: React.FC<Props> = ({ positions }) => {
  const { address, chain, endTime, pool, useMarketUnits, stEthPerToken } =
    useContext(MarketContext);
  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  const calculateEntryPrice = (position: any) => {
    let entryPrice = 0;
    if (!position.isLP) {
      const isLong = Number(position.baseToken) > 0;
      if (isLong) {
        let baseTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => Number(t.baseTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            baseTokenDeltaTotal += Number(transaction.baseTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.baseTokenDelta)
            );
          }, 0);
        entryPrice /= baseTokenDeltaTotal;
      } else {
        let quoteTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => Number(t.quoteTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            quoteTokenDeltaTotal += Number(transaction.quoteTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.quoteTokenDelta)
            );
          }, 0);
        entryPrice /= quoteTokenDeltaTotal;
      }
    }
    const unitsAdjustedEntryPrice = useMarketUnits
      ? entryPrice
      : convertWstEthToGwei(entryPrice, stEthPerToken);
    return formatUnits(BigInt(unitsAdjustedEntryPrice), 18);
  };

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Market</Th>
            <Th>Position</Th>
            <Th>Collateral</Th>
            <Th>Size</Th>
            <Th>Entry Price</Th>
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
              const pnl = calculatePnL(row, pool);
              const entryPrice = calculateEntryPrice(row);
              return (
                <Tr key={row.id}>
                  <Td>
                    {row.epoch.market.name} (Epoch {row.epoch.epochId})
                  </Td>
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
                    <NumberDisplay value={entryPrice} />{' '}
                    {useMarketUnits ? 'wstETH' : 'gwei'}
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
