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
  useToast,
  useQuery,
} from '@chakra-ui/react';
import axios from 'axios';
import type React from 'react';
import { useEffect } from 'react';

import { API_BASE_URL } from '~/lib/constants/constants';
import { useLoading } from '~/lib/context/LoadingContext';
import { useMarketList, type Market } from '~/lib/context/MarketListProvider';

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error } = useMarketList();

  console.log('markets=', markets);

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
                      <EpochItem
                        key={epoch.epochId}
                        epoch={epoch}
                        market={market}
                      />
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

const EpochItem: React.FC<{ epoch: Market['epochs'][0]; market: Market }> = ({
  market,
  epoch,
}) => {
  const { setIsLoading } = useLoading();
  const toast = useToast();
  // const latestPriceQueries = markets.flatMap((market) =>
  //   market.epochs.map((epoch) => ({
  //     queryKey: [
  //       'latestPrice',
  //       `${market.chainId}:${market.address}`,
  //       epoch.epochId,
  //     ],
  //     queryFn: () =>
  //       getLatestEpochPrice(market.chainId, market.address, epoch.epochId),
  //     enabled: markets.length !== 0,
  //   }))
  // );

  // const results = useQuery({ queries: latestPriceQueries });

  // const getLatestEpochPrice = async (
  //   chainId: number,
  //   address: string,
  //   epochId: number
  // ) => {
  //   const response = await fetch(
  //     `${API_BASE_URL}/prices/index/latest?contractId=${chainId}:${address}&epochId=${epochId}`
  //   );
  //   if (!response.ok) {
  //     throw new Error('Network response was not ok');
  //   }
  //   const data = await response.json();
  //   return data.price;
  // };

  const handleGetMissing = async (market: Market, epochId: number) => {
    setIsLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/missing-blocks?chainId=${market.chainId}&address=${market.address}&epochId=${epochId}`
      );
      console.log('response', response);
      toast({
        title: 'Finished Getting Missing Blocks',
        description: `${response.data.missingBlockNumbers.length} missing blocks found. See console for more info`,
        status: 'success',
        duration: 9000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'There was an issue getting missing blocks.',
        status: 'error',
        duration: 9000,
        isClosable: true,
      });
    }
    setIsLoading(false);
  };

  return (
    <Tr key={epoch.id}>
      <Td>
        <Button
          size="sm"
          onClick={() => handleGetMissing(market, epoch.epochId)}
        >
          Get Missing Blocks
        </Button>
      </Td>
      <Td>{epoch.epochId}</Td>
      <Td>{new Date(epoch.startTimestamp * 1000).toLocaleString()}</Td>
      <Td>{new Date(epoch.startTimestamp * 1000).toLocaleString()}</Td>
      <Td>{new Date(epoch.endTimestamp * 1000).toLocaleString()}</Td>
    </Tr>
  );
};

export default MarketsTable;
