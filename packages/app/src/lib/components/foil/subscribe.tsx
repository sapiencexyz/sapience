'use client';

import { InfoOutlineIcon } from '@chakra-ui/icons';
import {
  useToast,
  Text,
  Heading,
  FormControl,
  InputGroup,
  Input,
  InputRightAddon,
  FormErrorMessage,
  Box,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import {
  type FC,
  type FormEvent,
  useState,
  useEffect,
  useContext,
  useRef,
} from 'react';
import React from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, zeroAddress } from 'viem';
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
import { calculateCollateralDeltaLimit } from '../../util/tradeUtil';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const Subscribe: FC = () => {
  const [size, setSize] = useState<string>('');
  const slippage = 0.5;
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [estimatedFillPrice, setEstimatedFillPrice] = useState<string | null>(
    null
  );

  const account = useAccount();
  const { isConnected, address } = account;
  const { setIsLoading } = useLoading();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect();

  const {
    address: marketAddress,
    chainId,
    epoch,
    collateralAsset,
    foilData,
    stEthPerToken,
    collateralAssetDecimals,
    collateralAssetTicker,
    pool,
    refetchUniswapData,
    startTime,
    endTime,
  } = useContext(MarketContext);

  const refPrice = pool?.token0Price.toSignificant(3);

  const toast = useToast();

  const isLong = true;

  // Format start and end times
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  };

  const formattedStartTime = startTime ? formatDate(Number(startTime)) : '';
  const formattedEndTime = endTime ? formatDate(Number(endTime)) : '';

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, foilData.address],
    chainId,
  });

  // Convert gas to gigagas for internal calculations
  const sizeInGigagas = (size ? parseFloat(size) : 0) * 1e9;

  // Quote function
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, BigInt(Math.floor(sizeInGigagas))],
    chainId,
    account: address || zeroAddress,
    query: { enabled: size !== '' && parseFloat(size) > 0 },
  });

  useEffect(() => {
    const quoteResult = quoteCreatePositionResult.data?.result;
    if (quoteResult !== undefined) {
      setCollateralDelta(quoteResult as unknown as bigint);
    } else {
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
      onSuccess: () => {
        renderToast(
          toast,
          'Approval transaction submitted. Waiting for confirmation...',
          'info'
        );
      },
    },
  });

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      renderToast(toast, `We've created your position for you.`);
      resetAfterSuccess();
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (approveSuccess) {
      const handleSuccess = async () => {
        await refetchAllowance();
        handleSubmit(undefined, true);
      };
      handleSuccess();
    }
  }, [approveSuccess]);

  useEffect(() => {
    if (
      quoteCreatePositionResult.data?.result !== undefined &&
      size !== '' &&
      parseFloat(size) > 0 &&
      stEthPerToken
    ) {
      const fillPrice =
        BigInt(quoteCreatePositionResult.data?.result as unknown as bigint) /
        BigInt(parseFloat(size));
      const fillPriceInEth =
        Number(formatUnits(fillPrice, collateralAssetDecimals)) * stEthPerToken;
      setEstimatedFillPrice(fillPriceInEth.toString());
    } else {
      setEstimatedFillPrice(null);
    }
  }, [
    quoteCreatePositionResult.data,
    size,
    collateralAssetDecimals,
    stEthPerToken,
  ]);

  const handleSubmit = (e?: FormEvent<HTMLFormElement>, approved?: boolean) => {
    if (e) e.preventDefault();
    if (size === '' || parseFloat(size) <= 0) {
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
    setIsLoading(true);

    const sizeInTokens = BigInt(Math.floor(sizeInGigagas));

    const collateralDeltaLimit = calculateCollateralDeltaLimit(
      collateralAssetDecimals,
      collateralDelta,
      slippage,
      refPrice,
      !isLong
    );
    console.log('********************');
    console.log('collateralDelta', collateralDelta);
    console.log('collateralDeltaLimit', collateralDeltaLimit);
    console.log('allowance', allowance);
    console.log('sizeInTokens', sizeInTokens);
    console.log('refPrice', refPrice);
    console.log('********************');

    // Set deadline to 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    if (
      !approved &&
      allowance &&
      collateralDeltaLimit > (allowance as bigint)
    ) {
      console.log('approving...');
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, collateralDeltaLimit],
      });
    } else {
      console.log('creating trade position....');
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [epoch, sizeInTokens, collateralDeltaLimit, deadline],
      });
    }
  };

  const resetAfterError = () => {
    setPendingTxn(false);
    setIsLoading(false);
  };

  const resetAfterSuccess = () => {
    setSize('0');
    setPendingTxn(false);
    setIsLoading(false);
    refetchUniswapData();
  };

  const handleSizeChange = (newVal: string) => {
    // Remove any non-digit characters
    const sanitizedValue = newVal.replace(/[^\d]/g, '');

    if (sanitizedValue !== newVal) {
      // If the sanitized value is different, it means a non-digit was entered
      toast({
        title: 'Invalid input',
        description: 'Please enter whole numbers only.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    }

    setSize(sanitizedValue);
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

    if (currentChainId !== chainId) {
      return (
        <Button
          width="full"
          variant="brand"
          size="lg"
          onClick={() => switchChain({ chainId })}
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
          parseFloat(size) <= 0
        }
        size="lg"
      >
        Create Subscription
      </Button>
    );
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <Heading size="lg" mb={2}>
        Ethereum Gas Subscription
      </Heading>
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
      <FormControl mb={4} isInvalid={Boolean(quoteError)}>
        <InputGroup>
          <Input
            ref={inputRef}
            value={size}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            min={0}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => handleSizeChange(e.target.value)}
            autoComplete="off"
          />
          <InputRightAddon>gas</InputRightAddon>
        </InputGroup>
        {quoteError && (
          <FormErrorMessage>
            Foil cannot generate a quote for this order.
          </FormErrorMessage>
        )}
      </FormControl>

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
          <NumberDisplay value={estimatedFillPrice || '0'} /> gwei
        </Text>
      </Box>

      {renderActionButton()}
    </form>
  );
};

export default Subscribe;
