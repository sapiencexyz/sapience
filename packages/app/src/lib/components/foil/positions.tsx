import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Box,
} from '@chakra-ui/react';
import { times } from 'lodash';
import { useEffect, useState, useContext } from 'react';
import type { AbiFunction } from 'viem';
import { useReadContract, useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';

import CreateAccount from './createPosition';
import PositionRow from './positionRow';
import useFoilDeployment from './useFoilDeployment';

export default function Positions() {
  const { chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const totalSupplyResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'totalSupply',
    args: [],
  });
  const [totalSupply, setTotalSupply] = useState(0);

  useEffect(() => {
    if (totalSupplyResult.data) {
      setTotalSupply(parseInt(totalSupplyResult.data.toString(), 10));
    }
  }, [totalSupplyResult.data]); // Effect to update totalSupply when data changes

  const tokens = useReadContracts({
    contracts: times(totalSupply).map((i) => {
      return {
        abi: foilData.abi as AbiFunction[],
        address: foilData.address as `0x${string}`,
        functionName: 'tokenByIndex',
        args: [i],
      };
    }),
  });

  return (
    <Box mt={4}>
      <TableContainer mb={4}>
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Collateral</Th>
              <Th>Low Price</Th>
              <Th>High Price</Th>
              <Th>Net Position</Th>
              <Th>Gain/Loss</Th>
              <Th isNumeric />
            </Tr>
          </Thead>
          <Tbody>
            {tokens?.data?.map((i) => (
              <PositionRow key={i.result} id={i.result} />
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Box maxW="190px">
        <CreateAccount />
      </Box>
    </Box>
  );
}
