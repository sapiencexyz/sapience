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
  Flex,
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
} from 'react';
import React from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import {
  calculateCollateralDeltaLimit,
  getMinResultBalance,
} from '../../util/tradeUtil';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const Subscribe: FC = () => {
  const [size, setSize] = useState<number>(0);
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

  const {
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    epoch,
    foilData,
    chainId,
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

  const formattedStartTime = startTime ? formatDate(Number(startTime)) : 'X';
  const formattedEndTime = endTime ? formatDate(Number(endTime)) : 'Y';

  // Collateral balance for current address/account
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
    chainId,
  });

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, foilData.address],
    chainId,
  });

  // Quote function
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, parseUnits(`${size}`, collateralAssetDecimals)],
    chainId,
    query: { enabled: size !== 0 },
  });

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
    if (quoteCreatePositionResult.data?.result !== undefined) {
      setCollateralDelta(
        quoteCreatePositionResult.data.result as unknown as bigint
      );
    } else {
      setCollateralDelta(BigInt(0));
    }
  }, [quoteCreatePositionResult.data]);

  useEffect(() => {
    if (quoteCreatePositionResult.data?.result !== undefined && size !== 0) {
      const fillPrice =
        (quoteCreatePositionResult.data.result as unknown as bigint) /
        BigInt(Math.abs(Math.round(size * 10 ** 18)));
      setEstimatedFillPrice(formatUnits(fillPrice, collateralAssetDecimals));
    } else {
      setEstimatedFillPrice(null);
    }
  }, [quoteCreatePositionResult.data, size, collateralAssetDecimals]);

  const handleSubmit = (e?: FormEvent<HTMLFormElement>, approved?: boolean) => {
    if (e) e.preventDefault();
    setPendingTxn(true);
    setIsLoading(true);

    const sizeInTokens = parseUnits(`${size}`, collateralAssetDecimals);

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
        args: [foilData.address, collateralDeltaLimit],
      });
    } else {
      console.log('creating trade position....');
      writeContract({
        abi: foilData.abi,
        address: foilData.address as `0x${string}`,
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
    setSize(0);
    setPendingTxn(false);
    setIsLoading(false);
    refetchUniswapData();
  };

  const currentBalance = collateralBalance
    ? formatUnits(collateralBalance as bigint, collateralAssetDecimals)
    : '0';
  const estimatedNewBalance = collateralBalance
    ? formatUnits(
        (collateralBalance as bigint) - collateralDelta,
        collateralAssetDecimals
      )
    : '0';

  const minResultingBalance = getMinResultBalance(
    BigInt((collateralBalance as string) || 0),
    refPrice,
    collateralAssetDecimals,
    collateralDelta,
    slippage
  );

  const handleSizeChange = (newVal: string) => {
    const newSize = parseFloat(newVal || '0');
    setSize(newSize);
  };

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
        the quote you’re provided, you will be able to redeem a rebate from Foil
        at the end of this period."
        >
          <InfoOutlineIcon opacity={0.7} transform="translateY(-2.5px)" />
        </Tooltip>
      </Text>
      <FormControl mb={4} isInvalid={Boolean(quoteError)}>
        <InputGroup>
          <Input
            value={size}
            type="number"
            min={0}
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => handleSizeChange(e.target.value)}
          />
          <InputRightAddon>Ggas</InputRightAddon>
        </InputGroup>
        {quoteError && (
          <FormErrorMessage>
            The protocol cannot generate a quote for this order.
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
          <NumberDisplay value={estimatedFillPrice || 0} />{' '}
          {collateralAssetTicker}/vGGas
        </Text>
      </Box>

      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={pendingTxn || isLoadingCollateralChange}
          isDisabled={
            pendingTxn || isLoadingCollateralChange || Boolean(quoteError)
          }
          size="lg"
        >
          Create Subscription
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit" size="lg">
          Connect Wallet
        </Button>
      )}
    </form>
  );
};

export default Subscribe;
