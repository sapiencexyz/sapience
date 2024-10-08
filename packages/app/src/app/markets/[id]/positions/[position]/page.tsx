'use client';

import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Flex,
  Box,
  Heading,
  Spinner,
  Text,
  UnorderedList,
  ListItem,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import NumberDisplay from '~/lib/components/foil/numberDisplay';
import TransactionTable from '~/lib/components/foil/transactionTable';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';

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

  const { pool } = useContext(MarketContext);

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
  } = usePosition(contractId, positionId);

  const {
    data: transactions,
    error: transactionsError,
    isLoading: isLoadingTransactions,
  } = useTransactions(contractId, positionId);

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
          <UnorderedList spacing={2}>
            <ListItem>Epoch: {positionData.epoch.id}</ListItem>
            <ListItem>
              {positionData.isLP ? 'Liquidity Provider' : 'Trader'}
            </ListItem>
            <ListItem>
              Collateral: <NumberDisplay value={positionData.collateral} />{' '}
              wstETH
            </ListItem>
            <ListItem>
              Base Token: <NumberDisplay value={positionData.baseToken} /> Ggas
            </ListItem>
            <ListItem>
              Quote Token: <NumberDisplay value={positionData.quoteToken} />{' '}
              wstETH
            </ListItem>
            <ListItem>
              Borrowed Base Token: <NumberDisplay value={positionData.borrowedBaseToken} /> Ggas
            </ListItem>
            <ListItem>
              Borrowed Quote Token: <NumberDisplay value={positionData.borrowedQuoteToken} />{' '}
              wstETH
            </ListItem>
            {positionData.isLP ? (
              <>
                <ListItem>
                  Low Price: <NumberDisplay value={positionData.lowPrice} />{' '}
                  Ggas/wstETH
                </ListItem>
                <ListItem>
                  High Price: <NumberDisplay value={positionData.highPrice} />{' '}
                  Ggas/wstETH
                </ListItem>
              </>
            ) : (
              <ListItem>
                Size:{' '}
                <NumberDisplay
                  value={
                    positionData.baseToken - positionData.borrowedBaseToken
                  }
                />{' '}
                Ggas
              </ListItem>
            )}
            {/* <ListItem>
              Profit/Loss: <NumberDisplay value={pnl} /> wstETH{' '}
              <Tooltip label="This is an estimate that does not take into account slippage or fees.">
                <QuestionOutlineIcon transform="translateY(-2px)" />
              </Tooltip>
            </ListItem> */}
          </UnorderedList>
        </Box>
      );
    }
    return null;
  };

  return (
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
        {!isLoadingTransactions && (
          <Box>
            <Heading size="md" mx={4} mb={2}>
              Transactions
            </Heading>
            <TransactionTable
              isLoading={isLoadingTransactions}
              error={transactionsError as Error | null}
              transactions={transactions}
              contractId={contractId}
            />
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export default PositionPage;
