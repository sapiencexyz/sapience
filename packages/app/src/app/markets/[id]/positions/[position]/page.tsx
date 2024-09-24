'use client';

import { RepeatIcon } from '@chakra-ui/icons';
import { Flex, Box, Heading, Button, Spinner, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

import NumberDisplay from '~/lib/components/foil/numberDisplay';
import TransactionTable from '~/lib/components/foil/transactionTable';
import { API_BASE_URL } from '~/lib/constants/constants';

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

const useTransactions = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['transactions', contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/transactions?contractId=${contractId}&positionId=${positionId}`
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

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
    refetch: refetchPosition,
  } = usePosition(contractId, positionId);

  const {
    data: transactions,
    error: transactionsError,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useTransactions(contractId, positionId);

  const refetchData = () => {
    refetchPosition();
    refetchTransactions();
  };

  const renderPositionData = () => {
    if (isLoadingPosition) {
      return <Spinner />;
    }
    if (positionError) {
      return <Text>Error: {(positionError as Error).message}</Text>;
    }
    if (positionData) {
      return (
        <Box mb={8}>
          <Heading mb={4}>Position #{positionId}</Heading>
          <Text>
            Collateral: <NumberDisplay value={positionData.collateral} /> wstETH
          </Text>
          <Text>
            Base Token: <NumberDisplay value={positionData.baseToken} /> Ggas
          </Text>
          <Text>
            Quote Token: <NumberDisplay value={positionData.quoteToken} />{' '}
            wstETH
          </Text>
        </Box>
      );
    }
    return null;
  };

  return (
    <Flex direction="column" alignItems="left" mb={8} w="full" py={8}>
      {renderPositionData()}

      <Box mt={8}>
        <Heading size="md" mb={4}>
          Transactions
        </Heading>
        <TransactionTable
          isLoading={isLoadingTransactions}
          error={transactionsError as Error | null}
          transactions={transactions}
          contractId={contractId}
        />
      </Box>
    </Flex>
  );
};

export default PositionPage;
