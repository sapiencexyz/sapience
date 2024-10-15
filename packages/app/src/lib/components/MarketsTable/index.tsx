import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Box,
  Text,
  Button,
} from '@chakra-ui/react';
import type React from 'react';

import { useMarketList, type Market } from '~/lib/context/MarketListProvider';

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error } = useMarketList();

  console.log('markets=', markets);
  const handleGetMissing = () => {
    alert('working on this next');
  };
  return (
    <Box overflowX="auto">
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Market Address</Th>
            <Th>Chain ID</Th>
            <Th>Epochs</Th>
          </Tr>
        </Thead>
        <Tbody>
          {markets.map((market) => (
            <Tr key={market.id}>
              <Td>{market.address}</Td>
              <Td>{market.chainId}</Td>
              <Td padding={0}>
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Action</Th>
                      <Th>Epoch ID</Th>
                      <Th>Start Timestamp</Th>
                      <Th>End Timestamp</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {market.epochs.map((epoch) => (
                      <Tr key={epoch.id}>
                        <Td>
                          <Button size="sm" onClick={handleGetMissing}>
                            Get Missing Blocks
                          </Button>
                        </Td>
                        <Td>{epoch.epochId}</Td>
                        <Td>
                          {new Date(
                            epoch.startTimestamp * 1000
                          ).toLocaleString()}
                        </Td>
                        <Td>
                          {new Date(epoch.endTimestamp * 1000).toLocaleString()}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};

export default MarketsTable;
