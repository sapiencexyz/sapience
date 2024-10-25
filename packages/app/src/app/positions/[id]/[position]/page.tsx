'use client';

import { Flex, Box, Heading, Spinner, List } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import NumberDisplay from '~/lib/components/foil/numberDisplay';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext, MarketProvider } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const usePosition = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['position', contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/positions/${positionId}?contractId=${contractId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const PositionPage = ({
  params,
}: {
  params: { id: string; position: string };
}) => {
  const { id, position } = params;
  const [chainId, marketAddress] = id.split('%3A'); // Decoded contractId
  const positionId = position;

  const contractId = `${chainId}:${marketAddress}`;

  const { pool } = useContext(MarketContext);

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
  } = usePosition(contractId, positionId);

  const calculatePnL = (positionData: any) => {
    if (positionData.isLP) {
      const vEthToken = parseFloat(positionData.quoteToken);
      const vGasToken = parseFloat(positionData.baseToken);
      const marketPrice = parseFloat(
        pool?.token0Price?.toSignificant(18) || '0'
      );
      return (
        vEthToken +
        vGasToken * marketPrice -
        parseFloat(positionData.collateral)
      );
    }
    const vEthToken = parseFloat(positionData.quoteToken);
    const borrowedVEth = parseFloat(positionData.borrowedQuoteToken);
    const vGasToken = parseFloat(positionData.baseToken);
    const borrowedVGas = parseFloat(positionData.borrowedBaseToken);
    const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');
    return vEthToken - borrowedVEth + (vGasToken - borrowedVGas) * marketPrice;
  };

  const renderPositionData = () => {
    if (isLoadingPosition) {
      return (
        <Box w="100%" textAlign="center" p={4}>
          <Spinner />
        </Box>
      );
    }
    if (positionError) {
      return (
        <Box w="100%" textAlign="center" p={4}>
          Error: {(positionError as Error).message}
        </Box>
      );
    }
    if (positionData) {
      const pnl = calculatePnL(positionData);
      return (
        <Box p={8}>
          <Heading mb={4}>Position #{positionId}</Heading>
          <List.Root>
            <List.Item>Epoch: {positionData.epoch.id}</List.Item>
            <List.Item>
              {positionData.isLP ? 'Liquidity Provider' : 'Trader'}
            </List.Item>
            <List.Item>
              Collateral: <NumberDisplay value={positionData.collateral} />{' '}
              wstETH
            </List.Item>
            <List.Item>
              Base Token: <NumberDisplay value={positionData.baseToken} /> Ggas
            </List.Item>
            <List.Item>
              Quote Token: <NumberDisplay value={positionData.quoteToken} />{' '}
              wstETH
            </List.Item>
            <List.Item>
              Borrowed Base Token:{' '}
              <NumberDisplay value={positionData.borrowedBaseToken} /> Ggas
            </List.Item>
            <List.Item>
              Borrowed Quote Token:{' '}
              <NumberDisplay value={positionData.borrowedQuoteToken} /> wstETH
            </List.Item>
            {positionData.isLP ? (
              <>
                <List.Item>
                  Low Price:{' '}
                  <NumberDisplay
                    value={tickToPrice(positionData.lowPriceTick)}
                  />{' '}
                  Ggas/wstETH
                </List.Item>
                <List.Item>
                  High Price:{' '}
                  <NumberDisplay
                    value={tickToPrice(positionData.highPriceTick)}
                  />{' '}
                  Ggas/wstETH
                </List.Item>
              </>
            ) : (
              <List.Item>
                Size:{' '}
                <NumberDisplay
                  value={
                    positionData.baseToken - positionData.borrowedBaseToken
                  }
                />{' '}
                Ggas
              </List.Item>
            )}
            {positionData.isSettled ? <List.Item>Settled</List.Item> : null}
          </List.Root>
        </Box>
      );
    }
    return null;
  };

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(positionData?.epoch?.id)}
    >
      <Flex w="100%" p={6}>
        <Box
          m="auto"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          maxWidth="container.md"
          width="100%"
        >
          {renderPositionData()}
        </Box>
      </Flex>
    </MarketProvider>
  );
};

export default PositionPage;
