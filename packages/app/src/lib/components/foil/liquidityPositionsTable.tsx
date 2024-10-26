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
import { useContext } from 'react';

import { MarketContext } from '../../context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

import Address from './address';
import NumberDisplay from './numberDisplay';

interface Props {
  positions: any[];
}
const LiquidityPositionsTable: React.FC<Props> = ({ positions }) => {
  const { pool, endTime, chain, address } = useContext(MarketContext);
  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  const calculatePnL = (position: any) => {
    const vEthToken = parseFloat(position.quoteToken);
    const vGasToken = parseFloat(position.baseToken);
    const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');

    return (
      vEthToken + vGasToken * marketPrice - parseFloat(position.collateral)
    );
  };

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Market</Th>
            <Th>Position</Th>
            <Th>Collateral</Th>
            <Th>Base Token</Th>
            <Th>Quote Token</Th>
            <Th>Low Price</Th>
            <Th>High Price</Th>
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
                    <NumberDisplay value={row.baseToken} /> Ggas
                  </Td>
                  <Td>
                    <NumberDisplay value={row.quoteToken} /> wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={tickToPrice(row.lowPriceTick)} />{' '}
                    Ggas/wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={tickToPrice(row.highPriceTick)} />{' '}
                    Ggas/wstETH
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

export default LiquidityPositionsTable;
