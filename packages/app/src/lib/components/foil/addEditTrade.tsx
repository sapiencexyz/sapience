import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Flex,
  Box,
  useRadioGroup,
  Button,
  Text,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import { useState, useEffect, useContext, useMemo } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import {
  calculateCollateralDeltaLimit,
  getMinResultBalance,
} from '../../util/tradeUtil';
import RadioCard from '../RadioCard';
import { MIN_BIG_INT_SIZE } from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import SizeInput from './sizeInput';
import SlippageTolerance from './slippageTolerance';

const tradeOptions = ['Long', 'Short'];

export default function AddEditTrade() {
  const { nftId, refreshPositions } = useAddEditPosition();
  const [size, setSize] = useState<number>(0);
  const [option, setOption] = useState<'Long' | 'Short'>('Long');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [estimatedFillPrice, setEstimatedFillPrice] = useState<string | null>(
    null
  );

  const account = useAccount();
  const { isConnected, address } = account;
  const { setIsLoading } = useLoading();
  const isEdit = nftId > 0;

  const {
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    epoch,
    foilData,
    chainId,
    pool,
    refetchUniswapData,
  } = useContext(MarketContext);

  const refPrice = pool?.token0Price.toSignificant(3);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'positionType',
    defaultValue: 'Long',
    onChange: (value) => setOption(value as 'Long' | 'Short'),
    value: option,
  });
  const group = getRootProps();
  const toast = useToast();

  const isLong = option === 'Long';

  // position data
  const { data: positionData, refetch: refetchPositionData } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  useEffect(() => {
    if (positionData && isEdit) {
      setOption(positionData.vGasAmount > BigInt(0) ? 'Long' : 'Short');
    }
  }, [positionData, isEdit]);
  const originalPositionSize: number = useMemo(() => {
    if (isEdit && positionData) {
      const sideFactor = positionData.vGasAmount > BigInt(0) ? 1 : -1;
      const _sizeBigInt =
        positionData.vGasAmount > BigInt(0)
          ? positionData.vGasAmount
          : positionData.borrowedVGas;
      const adjustedSize =
        _sizeBigInt >= MIN_BIG_INT_SIZE ? _sizeBigInt : BigInt(0);
      return (
        sideFactor *
        parseFloat(formatUnits(adjustedSize, collateralAssetDecimals))
      );
    }

    return 0;
  }, [positionData, isEdit, collateralAssetDecimals]);

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

  // Quote functions
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, parseUnits(`${size}`, collateralAssetDecimals)],
    chainId,
    query: { enabled: !isEdit && size > 0 },
  });

  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, parseUnits(`${size}`, collateralAssetDecimals)],
    chainId,
    query: { enabled: isEdit && size !== originalPositionSize },
  });

  useEffect(() => {
    if (
      quoteModifyPositionResult?.error &&
      isEdit &&
      size !== originalPositionSize
    ) {
      setQuoteError(quoteModifyPositionResult.error.message);
    } else if (quoteCreatePositionResult.error && !isEdit) {
      setQuoteError(quoteCreatePositionResult.error.message);
    } else {
      setQuoteError(null);
    }
  }, [
    quoteCreatePositionResult.error,
    quoteModifyPositionResult?.error,
    size,
    originalPositionSize,
    isEdit,
  ]);

  const isLoadingCollateralChange = isEdit
    ? quoteModifyPositionResult.isFetching
    : quoteCreatePositionResult.isFetching;

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
      renderToast(
        toast,
        `We've ${nftId === 0 ? 'created' : 'updated'} your position for you.`
      );
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
    const quoteResult = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;
    if (quoteResult !== undefined) {
      setCollateralDelta(quoteResult as unknown as bigint);
    } else {
      setCollateralDelta(BigInt(0));
    }
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  useEffect(() => {
    const quoteResult = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;
    if (quoteResult !== undefined && size !== 0) {
      const fillPrice =
        (quoteResult as unknown as bigint) /
        BigInt(Math.abs(Math.round(size * 10 ** 18)));
      setEstimatedFillPrice(formatUnits(fillPrice, collateralAssetDecimals));
    } else {
      setEstimatedFillPrice(null);
    }
  }, [
    isEdit,
    quoteCreatePositionResult.data,
    quoteModifyPositionResult.data,
    size,
    collateralAssetDecimals,
  ]);

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement>,
    approved?: boolean
  ) => {
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

    if (!allowance) {
      console.log('refetching  allowance...');
      await refetchAllowance();
    }
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
    } else if (isEdit) {
      writeContract({
        abi: foilData.abi,
        address: foilData.address as `0x${string}`,
        functionName: 'modifyTraderPosition',
        args: [nftId, sizeInTokens, collateralDeltaLimit, deadline],
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

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
  };

  const resetAfterError = () => {
    setPendingTxn(false);
    setIsLoading(false);
  };

  const resetAfterSuccess = () => {
    setSize(0);
    setSlippage(0.5);
    setPendingTxn(false);
    setIsLoading(false);
    refreshPositions();
    refetchPositionData();
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

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button width="full" variant="brand" type="submit" mb={4} size="lg">
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== chainId) {
      return (
        <Button
          width="full"
          variant="brand"
          mb={4}
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
          pendingTxn || isLoadingCollateralChange || Boolean(quoteError)
        }
        mb={4}
        size="lg"
      >
        {isEdit ? 'Update Position' : 'Create Position'}
      </Button>
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <Flex {...group} gap={4} mb={4}>
        {tradeOptions.map((value) => {
          const radio = getRadioProps({ value });
          return (
            <RadioCard key={value} {...radio}>
              {value}
            </RadioCard>
          );
        })}
      </Flex>
      <SizeInput
        nftId={nftId}
        originalPositionSize={originalPositionSize}
        setSize={setSize}
        isLong={isLong}
        positionData={positionData}
        error={Boolean(quoteError)}
      />
      <SlippageTolerance onSlippageChange={handleSlippageChange} />
      {renderActionButton()}
      <Flex gap={2} flexDir="column">
        {!isLoadingCollateralChange && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Estimated Wallet Balance Adjustment{' '}
              <Tooltip label="Your slippage tolerance sets a maximum limit on how much additional collateral Foil can use or the minimum amount of collateral you will receive back, protecting you from unexpected market changes between submitting and processing your transaction.">
                <QuestionOutlineIcon transform="translateY(-1px)" ml={0.5} />
              </Tooltip>
            </Text>
            <Text fontSize="sm" color="gray.600">
              <NumberDisplay value={currentBalance} /> {collateralAssetTicker} →{' '}
              <NumberDisplay value={estimatedNewBalance} />{' '}
              {collateralAssetTicker} (
              {collateralDelta >= BigInt(0) ? 'Min.' : 'Max.'}{' '}
              <NumberDisplay value={minResultingBalance} />{' '}
              {collateralAssetTicker})
            </Text>
          </Box>
        )}
        {isEdit && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Position Size
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay value={originalPositionSize} /> vGGas →{' '}
              <NumberDisplay value={size} /> vGGas
            </Text>
          </Box>
        )}
        {estimatedFillPrice && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Estimated Fill Price
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay value={estimatedFillPrice} />{' '}
              {collateralAssetTicker}/vGGas
            </Text>
          </Box>
        )}
      </Flex>
    </form>
  );
}
