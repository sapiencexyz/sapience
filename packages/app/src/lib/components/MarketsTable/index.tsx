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
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type React from 'react';
import { useWriteContract } from 'wagmi';

import useFoilDeployment from '../foil/useFoilDeployment';
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
                        market={market}
                        epoch={epoch}
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
  const { foilData, loading, error } = useFoilDeployment(market?.chainId);

  const { writeContract: settleWithPrice } = useWriteContract();

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: ['latestPrice', `${market?.chainId}:${market?.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/index/latest?contractId=${market.chainId}:${market.address}&epochId=${epoch.epochId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.price;
    },
    enabled: epoch.epochId !== 0 || market !== undefined,
  });
  console.log('latestPrice', latestPrice);
  console.log('isLatestPriceLoading', isLatestPriceLoading);
  console.log('epoch', epoch, market, market?.chainId, market?.address);

  const handleGetMissing = async (m: Market, epochId: number) => {
    setIsLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/missing-blocks?chainId=${m.chainId}&address=${m.address}&epochId=${epochId}`
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
      <Td>
        {isLatestPriceLoading ? (
          'Loading...'
        ) : (
          <>
            <Text>latestPrice</Text>
            <Button
              onClick={() => {
                settleWithPrice({
                  address: market.address as `0x${string}`,
                  abi: foilData.abi,
                  functionName: 'submitSettlementPrice',
                  args: [epoch.epochId, latestPrice],
                });
              }}
            >
              Settle with Price
            </Button>
          </>
        )}
      </Td>
    </Tr>
  );
};

export default MarketsTable;
