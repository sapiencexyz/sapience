import { ChevronDownIcon } from '@chakra-ui/icons';
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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Switch,
  Flex,
  Spinner,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { parseUnits, zeroAddress } from 'viem';
import * as Chains from 'viem/chains';
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import useFoilDeployment from '../foil/useFoilDeployment';
import MarketAddress from '../MarketAddress';
import {
  API_BASE_URL,
  DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useMarketList, type Market } from '~/lib/context/MarketListProvider';
import { formatAmount } from '~/lib/util/numberUtil';
import {
  gweiToEther,
  renderContractErrorToast,
  renderToast,
} from '~/lib/util/util';

const MarketsTable: React.FC = () => {
  const { markets, isLoading, error, refetchMarkets } = useMarketList();
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});
  console.log('markets=', markets);

  const updateMarketPrivacy = async (market: Market) => {
    setLoadingAction((prev) => ({ ...prev, [market.address]: true }));
    const response = await axios.post(`${API_BASE_URL}/updateMarketPrivacy`, {
      address: market.address,
      chainId: market.chainId,
    });
    if (response.data.success) {
      await refetchMarkets();
    }
    setLoadingAction((prev) => ({ ...prev, [market.address]: false }));
  };

  if (isLoading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center">
        <Spinner
          thickness="4px"
          speed="0.65s"
          emptyColor="gray.200"
          color="blue.500"
          size="xl"
        />
        <Text>Loading Markets...</Text>
      </Box>
    );
  }

  return (
    <Box overflowX="auto">
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Market Address</Th>
            <Th>Chain ID</Th>
            <Th>Is Public?</Th>
            <Th>Epochs</Th>
          </Tr>
        </Thead>
        <Tbody>
          {markets.map((market) => (
            <Tr key={market.id}>
              <Td>
                <MarketAddress address={market.address} />
              </Td>
              <Td>{market.chainId}</Td>
              <Td>
                <Flex mt={3} gap={2}>
                  <Text fontSize="sm">{market.public ? 'yes' : 'no'}</Text>
                  <Switch
                    isChecked={market.public}
                    size="sm"
                    onChange={() => updateMarketPrivacy(market)}
                    isDisabled={loadingAction[market.address]}
                  />
                </Flex>
                {loadingAction[market.address] && (
                  <Spinner size="sm" display="block" />
                )}
              </Td>
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

const EpochItem: React.FC<{
  epoch: Market['epochs'][0];
  market: Market;
}> = ({ market, epoch }) => {
  const account = useAccount();
  const { address } = account;
  const [loadingStEthPerToken, setLoadingStEthPerToken] = useState(false);
  const [stEthPerToken, setStEthPerToken] = useState(0);
  const toast = useToast();
  const { foilData, loading, error } = useFoilDeployment(market?.chainId);
  const { chainId, collateralAsset } = market;
  const { endTimestamp } = epoch;
  const [txnStep, setTxnStep] = useState(0);
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});

  const collateralTickerFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: market.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

  const currentTime = Math.floor(Date.now() / 1000);

  const stEthPerTokenResult = useReadContract({
    chainId: chainId === Chains.cannon.id ? Chains.sepolia.id : chainId,
    abi: [
      {
        inputs: [],
        name: 'stEthPerToken',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    address:
      chainId === Chains.cannon.id
        ? DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS
        : (collateralAsset as `0x${string}`),
    functionName: 'stEthPerToken',
  });

  useEffect(() => {
    if (stEthPerTokenResult.data) {
      setStEthPerToken(Number(gweiToEther(stEthPerTokenResult.data)));
    }
  }, [stEthPerTokenResult.data]);

  useEffect(() => {
    const updateSettledStEthPerToken = async () => {
      setLoadingStEthPerToken(true);
      console.log('repingging...');
      const response = await axios.get(
        `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${chainId}&collateralAssetAddress=${collateralAsset}&endTime=${endTimestamp}`
      );
      if (response.data.stEthPerToken) {
        setStEthPerToken(
          Number(gweiToEther(BigInt(response.data.stEthPerToken)))
        );
      }
      setLoadingStEthPerToken(false);
    };
    if (
      endTimestamp &&
      endTimestamp < currentTime &&
      chainId &&
      collateralAsset
    ) {
      updateSettledStEthPerToken();
    }
  }, [endTimestamp, chainId && collateralAsset]);

  const { data: epochData, refetch: refetchEpochData } = useReadContract({
    address: market.address as `0x${string}`,
    abi: foilData?.abi,
    functionName: 'getEpoch',
    args: [BigInt(epoch.epochId)],
    chainId: market.chainId,
    query: {
      enabled: !loading && !error && !!foilData,
    },
  }) as any;
  const epochSettled = epochData ? epochData[7] : undefined;
  const settlementPrice = epochData ? epochData[8] : undefined;
  const bondAmount =
    epochData && epochData[9] ? epochData[9].bondAmount : undefined;
  const bondCurrency =
    epochData && epochData[9] ? epochData[9].bondCurrency : undefined;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI as AbiFunction[],
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, market.address],
    account: address || zeroAddress,
    chainId: market.chainId,
    query: {
      enabled: !!address && !!bondAmount,
    },
  });

  const { writeContract: settleWithPrice, data: settlementHash } =
    useWriteContract({
      mutation: {
        onError: (settleError) => {
          renderContractErrorToast(
            settleError as WriteContractErrorType,
            toast,
            'Failed to settle'
          );
          resetAfterError();
        },
        onSuccess: () => {
          renderToast(
            toast,
            'Transaction submitted. Waiting for confirmation...',
            'info'
          );
        },
      },
    });

  const { isSuccess: isSettlementSuccess } = useWaitForTransactionReceipt({
    hash: settlementHash,
  });

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        resetAfterError();
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          'Failed to approve'
        );
      },
      onSuccess: async () => {
        await refetchAllowance();
      },
    },
  });

  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isApproveSuccess && txnStep === 1) {
      handleSettleWithPrice();
    }
  }, [isApproveSuccess, txnStep]);

  // handle successful txn
  useEffect(() => {
    if (isSettlementSuccess && txnStep === 2) {
      renderToast(
        toast,
        'Successfully settled. Note that it may take a few minutes while in the dispute period on UMA.',
        'success'
      );
      refetchEpochData();
      setTxnStep(0);
      setLoadingAction((prev) => ({ ...prev, settle: false }));
    }
  }, [isSettlementSuccess]);

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
  const priceAdjusted = latestPrice / (stEthPerToken || 1);

  const handleGetMissing = async (
    m: Market,
    epochId: number,
    model: string
  ) => {
    setLoadingAction((prev) => ({
      ...prev,
      getMissing: true,
    }));
    try {
      const response = await axios.get(
        `${API_BASE_URL}/missing-blocks?chainId=${m.chainId}&address=${m.address}&epochId=${epochId}&model=${model}`
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
    setLoadingAction((prev) => ({
      ...prev,
      getMissing: false,
    }));
  };

  const requireApproval = !allowance || bondAmount > (allowance as bigint);

  const handleSettleWithPrice = () => {
    settleWithPrice({
      address: market.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'submitSettlementPrice',
      args: [
        epoch.epochId,
        parseUnits(priceAdjusted.toString(), TOKEN_DECIMALS),
      ],
    });
    setTxnStep(2);
  };
  const handleApproveSettle = async () => {
    setLoadingAction((prev) => ({ ...prev, settle: true }));
    approveWrite({
      abi: erc20ABI,
      address: bondCurrency as `0x${string}`,
      functionName: 'approve',
      args: [market.address, bondAmount],
      chainId,
    });
    setTxnStep(1);
  };

  const resetAfterError = () => {
    setTxnStep(0);
    setLoadingAction((prev) => ({ ...prev, settle: false }));
  };

  const renderSettledCell = () => {
    if (epochSettled) {
      return (
        <>
          <Text>Settled</Text>
          <Text>{Number(settlementPrice)}</Text>
        </>
      );
    }

    if (isLatestPriceLoading) {
      return 'Loading Latest Price...';
    }

    return (
      <>
        <Text>{formatAmount(priceAdjusted)}</Text>
        <Button
          isLoading={
            loadingStEthPerToken ||
            stEthPerTokenResult.isLoading ||
            loadingAction.settle
          }
          isDisabled={!epochData}
          onClick={
            requireApproval ? handleApproveSettle : handleSettleWithPrice
          }
        >
          {requireApproval
            ? `Approve ${collateralTickerFunctionResult.data} Transfer`
            : 'Settle with Price'}
        </Button>
        {!epochData && (
          <Text color="red" size="sm" textAlign="center">
            Could not get epoch data for market{' '}
          </Text>
        )}
      </>
    );
  };

  return (
    <Tr key={epoch.id}>
      <Td>
        <Menu>
          <MenuButton as={Button} rightIcon={<ChevronDownIcon />} size="sm">
            Get Missing Blocks
          </MenuButton>
          <MenuList>
            <MenuItem
              as={Button}
              borderRadius={0}
              isLoading={loadingAction.getMissing}
              onClick={() =>
                handleGetMissing(market, epoch.epochId, 'ResourcePrice')
              }
            >
              Resource Prices
            </MenuItem>
            <MenuItem
              as={Button}
              borderRadius={0}
              isLoading={loadingAction.getMissing}
              onClick={() => handleGetMissing(market, epoch.epochId, 'Event')}
            >
              Events
            </MenuItem>
          </MenuList>
        </Menu>
      </Td>
      <Td>{epoch.epochId}</Td>
      <Td>{new Date(epoch.startTimestamp * 1000).toLocaleString()}</Td>
      <Td>{new Date(epoch.endTimestamp * 1000).toLocaleString()}</Td>
      <Td>{renderSettledCell()}</Td>
    </Tr>
  );
};

export default MarketsTable;
