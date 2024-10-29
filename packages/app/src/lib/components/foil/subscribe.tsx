'use client';

import { InfoOutlineIcon, UpDownIcon } from '@chakra-ui/icons';
import {
  useToast,
  Text,
  Heading,
  Box,
  Button,
  Tooltip,
  Flex,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FC,
  type FormEvent,
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
} from 'react';
import React from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { decodeEventLog, formatUnits, zeroAddress } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
  useConnect,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';
import {
  getChain,
  renderContractErrorToast,
  renderToast,
} from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import SizeInput from './sizeInput';

interface SubscribeProps {
  marketAddress?: string;
  chainId?: number;
  epoch?: number;
  showMarketSwitcher?: boolean;
}

const Subscribe: FC<SubscribeProps> = ({
  marketAddress: propMarketAddress,
  chainId: propChainId,
  epoch: propEpoch,
  showMarketSwitcher = false,
}) => {
  const searchParams = useSearchParams();
  const { markets } = useMarketList();

  const marketAddress =
    propMarketAddress ||
    searchParams.get('marketAddress') ||
    markets.filter((m) => m.public)[0]?.address;
  const chainId =
    propChainId ||
    Number(searchParams.get('chainId')) ||
    markets.filter((m) => m.public)[0]?.chainId;
  const epoch = propEpoch || Number(searchParams.get('epoch')) || 1;

  const [size, setSize] = useState<bigint>(BigInt(0));
  const slippage = 0.5;
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [fillPrice, setFillPrice] = useState<bigint>(BigInt(0));
  const [fillPriceInEth, setFillPriceInEth] = useState<bigint>(BigInt(0));
  const [txnStep, setTxnStep] = useState(0);
  const account = useAccount();
  const { isConnected, address } = account;
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect();

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );

  useEffect(() => {
    if (
      markets.filter((m) => m.public).length > 0 &&
      (!marketAddressParam || !chainIdParam) &&
      showMarketSwitcher
    ) {
      updateParams(
        markets.filter((m) => m.public)[0].address,
        markets.filter((m) => m.public)[0].chainId
      );
    }
  }, [markets, marketAddressParam, chainIdParam]);

  const updateParams = (address: string, chain: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('marketAddress', address);
    current.set('chainId', chain.toString());
    const search = current.toString();
    const query = search ? `?${search}` : '';
    router.push(`${window.location.pathname}${query}`);
  };

  const {
    address: contextMarketAddress,
    chainId: contextChainId,
    epoch: contextEpoch,
    collateralAsset,
    foilData,
    stEthPerToken,
    collateralAssetDecimals,
    collateralAssetTicker,
    refetchUniswapData,
    startTime,
    endTime,
  } = useContext(MarketContext);

  // Use prop values if provided, otherwise use context values
  const finalMarketAddress = marketAddress || contextMarketAddress;
  const finalChainId = chainId || contextChainId;
  const finalEpoch = epoch || contextEpoch;

  const toast = useToast();

  const router = useRouter();

  // Format start and end times
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  };

  const calculateCollateralDeltaLimit = (
    collateralDelta: bigint,
    slippage: number
  ) => {
    if (collateralDelta === BigInt(0)) return BigInt(0);

    const slippageMultiplier = BigInt(Math.floor((100 + slippage) * 100));
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - slippage) * 100)
    );

    if (collateralDelta > BigInt(0)) {
      return (collateralDelta * slippageMultiplier) / BigInt(10000);
    }
    return (collateralDelta * slippageReductionMultiplier) / BigInt(10000);
  };

  const formattedStartTime = startTime ? formatDate(Number(startTime)) : '';
  const formattedEndTime = endTime ? formatDate(Number(endTime)) : '';

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, finalMarketAddress],
    chainId: finalChainId,
  });

  // Convert gas to gigagas for internal calculations
  const sizeInGigagas = size * BigInt(1e9);

  // Quote function
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: finalMarketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [finalEpoch, sizeInGigagas],
    chainId: finalChainId,
    account: address || zeroAddress,
    query: { enabled: size !== BigInt(0) },
  });

  // Update the useEffect to set quoteResult and fillPrice from the result
  useEffect(() => {
    if (quoteCreatePositionResult.data?.result !== undefined) {
      const [quoteResultData, fillPriceData] =
        quoteCreatePositionResult.data.result;
      setFillPrice(fillPriceData as bigint);
      setCollateralDelta(quoteResultData as bigint);
    } else {
      setFillPrice(BigInt(0));
      setCollateralDelta(BigInt(0));
    }
  }, [quoteCreatePositionResult.data]);

  useEffect(() => {
    if (quoteCreatePositionResult.error) {
      setQuoteError(quoteCreatePositionResult.error.message);
    } else {
      setQuoteError(null);
    }
  }, [quoteCreatePositionResult.error, size]);

  const isLoadingCollateralChange = quoteCreatePositionResult.isFetching;

  // Write contract hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          `There was an issue creating/updating your position.`
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

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          'Failed to approve'
        );
        resetAfterError();
      },
      onSuccess: async () => {
        await refetchAllowance();
        renderToast(
          toast,
          'Approval transaction submitted. Waiting for confirmation...',
          'info'
        );
      },
    },
  });

  const { isSuccess: isConfirmed, data: createTraderPositionReceipt } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      for (const log of createTraderPositionReceipt.logs) {
        try {
          const event = decodeEventLog({
            abi: foilData.abi,
            data: log.data,
            topics: log.topics,
          });

          if ((event as any).eventName === 'TraderPositionCreated') {
            const nftId = (event as any).args.positionId.toString();
            router.push(
              `/trade/${finalChainId}:${finalMarketAddress}/epochs/${finalEpoch}?positionId=${nftId}`
            );
            renderToast(
              toast,
              `Your subscription has been created as position ID: ${nftId}`
            );
            resetAfterSuccess();
            return;
          }
        } catch (error) {
          // This log was not for the TraderPositionCreated event, continue to next log
        }
      }
    }
  }, [isConfirmed, createTraderPositionReceipt, txnStep]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      handleCreateTraderPosition();
    }
  }, [approveSuccess, txnStep]);

  useEffect(() => {
    if (fillPrice !== BigInt(0) && stEthPerToken) {
      const fillPriceInGwei =
        (fillPrice * BigInt(1e18)) /
        BigInt(stEthPerToken * 10 ** collateralAssetDecimals);
      setFillPriceInEth(fillPriceInGwei);
    } else {
      setFillPriceInEth(BigInt(0));
    }
  }, [fillPrice, collateralAssetDecimals, stEthPerToken]);

  const collateralDeltaLimit = useMemo(() => {
    return calculateCollateralDeltaLimit(collateralDelta, slippage);
  }, [collateralDelta, slippage]);

  const requireApproval =
    !allowance || collateralDeltaLimit > (allowance as bigint);

  const handleSubmit = (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (size === BigInt(0)) {
      toast({
        title: 'Invalid size',
        description: 'Please enter a positive gas amount.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    setPendingTxn(true);

    if (requireApproval) {
      console.log('approving...');
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [finalMarketAddress, collateralDeltaLimit],
      });
      setTxnStep(1);
    } else {
      handleCreateTraderPosition();
    }
  };

  const handleCreateTraderPosition = () => {
    const sizeInTokens = sizeInGigagas;
    // Set deadline to 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    const absCollateralDeltaLimit =
      collateralDeltaLimit < BigInt(0)
        ? -collateralDeltaLimit
        : collateralDeltaLimit;
    writeContract({
      abi: foilData.abi,
      address: finalMarketAddress as `0x${string}`,
      functionName: 'createTraderPosition',
      args: [finalEpoch, sizeInTokens, absCollateralDeltaLimit, deadline],
    });
    setTxnStep(2);
  };

  const resetAfterError = () => {
    setPendingTxn(false);
    setTxnStep(0);
  };

  const resetAfterSuccess = () => {
    setSize(BigInt(0));
    setPendingTxn(false);
    setTxnStep(0);
    refetchUniswapData();
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          width="full"
          variant="brand"
          size="lg"
          onClick={() => connect({ connector: connectors[0] })}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== finalChainId) {
      return (
        <Button
          width="full"
          variant="brand"
          size="lg"
          onClick={() => switchChain({ chainId: finalChainId })}
        >
          Switch Network
        </Button>
      );
    }

    return (
      <Button
        width="full"
        variant="brand"
        type="submit"
        isLoading={pendingTxn || isLoadingCollateralChange}
        isDisabled={
          pendingTxn ||
          isLoadingCollateralChange ||
          Boolean(quoteError) ||
          size <= BigInt(0)
        }
        size="lg"
      >
        {requireApproval
          ? 'Approve Subscription Creation'
          : 'Create Subscription'}
      </Button>
    );
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);

  const handleMarketSelectorOpen = () => setIsMarketSelectorOpen(true);
  const handleMarketSelectorClose = () => setIsMarketSelectorOpen(false);

  const handleMarketSelect = (address: string, chain: number) => {
    updateParams(address, chain);
    handleMarketSelectorClose();
  };

  const marketName =
    markets.find((m) => m.address === marketAddress)?.name || 'Choose Market';

  const [walletAddressInput, setWalletAddressInput] = useState<string>('');

  useEffect(() => {
    if (address) {
      setWalletAddressInput(address);
    }
  }, [address]);

  const [isEstimating, setIsEstimating] = useState(false);

  const handleEstimateUsage = async () => {
    if (!walletAddressInput) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a wallet address to estimate usage.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsEstimating(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/estimate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: walletAddressInput,
            chainId: finalChainId,
            marketAddress: finalMarketAddress,
            epochId: finalEpoch,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch estimate');
      }

      const data = await response.json();
      setSize(BigInt(Math.floor(data.estimatedGas)));
      toast({
        title: 'Estimate Complete',
        description: 'Gas amount has been populated based on historical usage.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Estimation Failed',
        description: 'Unable to estimate gas usage. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Flex alignItems="center" mb={2}>
        <Heading size="lg">{marketName} Subscription</Heading>
        {showMarketSwitcher && (
          <IconButton
            ml="auto"
            aria-label="Change Market"
            size="xs"
            icon={<UpDownIcon />}
            onClick={handleMarketSelectorOpen}
          />
        )}
      </Flex>
      <Text mb={4}>
        Enter the amount of gas you expect to use between {formattedStartTime}{' '}
        and {formattedEndTime}.{' '}
        <Tooltip
          label="If the average gas price in this time exceeds
        the quote you're provided in gwei, you will be able to redeem a rebate from Foil
        at the end of this period."
        >
          <InfoOutlineIcon opacity={0.7} transform="translateY(-2.5px)" />
        </Tooltip>
      </Text>

      <Accordion allowToggle mb={4}>
        <AccordionItem>
          <AccordionButton px={0}>
            <Box
              as="span"
              fontSize="sm"
              textTransform="uppercase"
              fontWeight="medium"
              color="gray.600"
              letterSpacing="wide"
              flex="1"
              textAlign="left"
            >
              Estimate Gas Usage
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel p={0}>
            <FormControl mt={2} mb={4}>
              <FormLabel>Wallet Address</FormLabel>
              <Input
                size="md"
                value={walletAddressInput}
                onChange={(e) => setWalletAddressInput(e.target.value)}
                isDisabled={isEstimating}
              />
            </FormControl>
            <Button
              w="100%"
              variant="brand"
              onClick={handleEstimateUsage}
              isLoading={isEstimating}
              loadingText="Estimating..."
              mb={6}
            >
              Estimate Usage
            </Button>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <SizeInput
        setSize={setSize}
        error={quoteError || undefined}
        label="Gas Amount"
      />

      <Box bg="gray.50" p={5} borderRadius="md" mb={4}>
        <Text color="gray.600" fontWeight="semibold" mb={1}>
          Quote
        </Text>
        <Text fontSize="lg" display="inline-block" mr={3}>
          <NumberDisplay
            value={formatUnits(collateralDelta, collateralAssetDecimals)}
          />{' '}
          {collateralAssetTicker}
        </Text>
        <Text fontSize="sm" display="inline-block" color="gray.600" mb={0.5}>
          <NumberDisplay value={formatUnits(fillPriceInEth, 9)} /> gwei
        </Text>
      </Box>

      {renderActionButton()}

      <Modal isOpen={isMarketSelectorOpen} onClose={handleMarketSelectorClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Select Market</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={0} pb={6}>
            <VStack spacing={2} align="stretch">
              {markets
                .filter((m) => m.public)
                .map((market) => (
                  <Flex
                    key={market.id}
                    justifyContent="space-between"
                    alignItems="center"
                    py={2}
                    px={4}
                    bg={
                      market.address === marketAddress
                        ? 'gray.100'
                        : 'transparent'
                    }
                    borderRadius="md"
                    cursor="pointer"
                    onClick={() =>
                      handleMarketSelect(market.address, market.chainId)
                    }
                    _hover={{ bg: 'gray.50' }}
                  >
                    <Text fontWeight="bold">{market.name}</Text>
                    <Text fontSize="sm" color="gray.600">
                      {getChain(market.chainId).name}
                    </Text>
                  </Flex>
                ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </form>
  );
};

export default Subscribe;
