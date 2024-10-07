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
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState, useEffect, useContext, useMemo } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits, zeroAddress } from 'viem';
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
import RadioCard from '../RadioCard';
import { MIN_BIG_INT_SIZE, TOKEN_DECIMALS } from '~/lib/constants/constants';
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
  const [sizeChange, setSizeChange] = useState<bigint>(BigInt(0));
  const [option, setOption] = useState<'Long' | 'Short'>('Long');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [
    quotedResultingPositionCollateral,
    setQuotedResultingPositionCollateral,
  ] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [estimatedFillPrice, setEstimatedFillPrice] = useState<string | null>(
    null
  );

  const account = useAccount();
  const { isConnected, address } = account;
  const { setIsLoading } = useLoading();
  const isEdit = nftId > 0;

  const {
    address: marketAddress,
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    epoch,
    foilData,
    chainId,
    pool,
    liquidity,
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

  const formError = useMemo(() => {
    if (
      sizeChange > BigInt(0) &&
      (!liquidity ||
        (isLong &&
          parseFloat(formatUnits(sizeChange, 18)) > Number(liquidity))) &&
      !isEdit
    ) {
      return 'Not enough liquidity to perform this trade.';
    }
    if (quoteError) {
      return 'The protocol cannot generate a quote for this order.';
    }
    return '';
  }, [quoteError, liquidity, sizeChange, isLong]);

  // position data
  const { data: positionData, refetch: refetchPositionData } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
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

  const originalPositionSize: bigint = useMemo(() => {
    if (isEdit && positionData) {
      const sideFactor =
        positionData.vGasAmount > BigInt(0) ? BigInt(1) : BigInt(-1);
      const _sizeBigInt =
        positionData.vGasAmount > BigInt(0)
          ? positionData.vGasAmount
          : positionData.borrowedVGas;
      const adjustedSize =
        _sizeBigInt >= MIN_BIG_INT_SIZE ? _sizeBigInt : BigInt(0);
      return sideFactor * adjustedSize;
    }

    return BigInt(0);
  }, [positionData, isEdit]);

  const sizeChangeInContractUnit = sizeChange * BigInt(1e9); // Convert sizeChange from gas to Ggas with 18 decimals
  const desiredSizeInContractUnit =
    originalPositionSize + sizeChangeInContractUnit;

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
    args: [address, marketAddress],
    account: address || zeroAddress,
    chainId,
  });

  console.log('sizeChange', sizeChange);
  console.log('originalPositionSize', originalPositionSize);
  console.log('sizeChangeInContractUnit', sizeChangeInContractUnit);
  console.log('desiredSizeInContractUnit', desiredSizeInContractUnit);

  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: !isEdit && sizeChangeInContractUnit !== BigInt(0) },
  });

  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: isEdit && sizeChangeInContractUnit !== BigInt(0) },
  });

  useEffect(() => {
    if (
      quoteModifyPositionResult?.error &&
      isEdit &&
      sizeChangeInContractUnit !== BigInt(0)
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
    sizeChange,
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
      setQuotedResultingPositionCollateral(quoteResult as unknown as bigint);
    } else {
      setQuotedResultingPositionCollateral(BigInt(0));
    }
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  useEffect(() => {
    if (
      quoteCreatePositionResult.data?.result !== undefined &&
      sizeChange > BigInt(0) &&
      pool?.token0Price
    ) {
      const collateralDelta = BigInt(
        quoteCreatePositionResult.data?.result as unknown as bigint
      );
      const sizeInWei = sizeChange * BigInt(1e9); // Convert gas to Ggas (wei)
      const fillPrice = Number(collateralDelta) / Number(sizeInWei);
      setEstimatedFillPrice(fillPrice.toFixed(6));
    } else {
      setEstimatedFillPrice(null);
    }
  }, [quoteCreatePositionResult.data, sizeChange, pool?.token0Price]);

  const collateralDelta =
    quotedResultingPositionCollateral -
    (positionData?.depositedCollateralAmount ?? BigInt(0));

  const collateralDeltaLimit = useMemo(() => {
    if (collateralDelta === BigInt(0)) return BigInt(0);

    const slippageMultiplier = BigInt(Math.floor((100 + slippage) * 100));
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - slippage) * 100)
    );

    if (collateralDelta > BigInt(0)) {
      return (collateralDelta * slippageMultiplier) / BigInt(10000);
    }
    return (collateralDelta * slippageReductionMultiplier) / BigInt(10000);
  }, [collateralDelta, slippage]);

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement>,
    approved?: boolean
  ) => {
    if (e) e.preventDefault();
    setPendingTxn(true);
    setIsLoading(true);

    // Set deadline to 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    const absCollateralDeltaLimit =
      collateralDeltaLimit < BigInt(0)
        ? -collateralDeltaLimit
        : collateralDeltaLimit;

    if (!allowance) {
      console.log('refetching  allowance...');
      await refetchAllowance();
      console.log('refetched  allowance =', allowance);
    }
    if (
      !approved &&
      allowance !== undefined &&
      collateralDeltaLimit > (allowance as bigint)
    ) {
      console.log('approving...');
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, collateralDeltaLimit],
      });
    } else if (isEdit) {
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'modifyTraderPosition',
        args: [
          nftId,
          desiredSizeInContractUnit,
          absCollateralDeltaLimit,
          deadline,
        ],
      });
    } else {
      console.log('creating trade position....');
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [
          epoch,
          desiredSizeInContractUnit,
          absCollateralDeltaLimit,
          deadline,
        ],
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
    setSizeChange(BigInt(0));
    setSlippage(0.5);
    setPendingTxn(false);
    setIsLoading(false);
    refreshPositions();
    refetchPositionData();
    refetchUniswapData();
  };

  const walletBalance = collateralBalance
    ? formatUnits(collateralBalance as bigint, collateralAssetDecimals)
    : '0';
  const quotedResultingWalletBalance = collateralBalance
    ? formatUnits(
        (collateralBalance as bigint) - collateralDelta,
        collateralAssetDecimals
      )
    : '0';

  const walletBalanceLimit =
    parseUnits(walletBalance, collateralAssetDecimals) - collateralDeltaLimit;
  const positionCollateralLimit =
    (positionData?.depositedCollateralAmount || BigInt(0)) +
    collateralDeltaLimit;

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { openConnectModal } = useConnectModal();

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          width="full"
          variant="brand"
          mb={4}
          size="lg"
          onClick={openConnectModal}
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
        isLoading={(pendingTxn || isLoadingCollateralChange) && !formError}
        isDisabled={
          !!formError ||
          pendingTxn ||
          isLoadingCollateralChange ||
          sizeChange === originalPositionSize
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
        setSize={setSizeChange}
        isLong={isLong}
        positionData={positionData}
        error={formError}
        label="Size"
        defaultToGas={false}
      />
      <SlippageTolerance onSlippageChange={handleSlippageChange} />
      {renderActionButton()}
      <Flex gap={2} flexDir="column">
        {!isLoadingCollateralChange &&
          walletBalance !== quotedResultingWalletBalance && (
            <Box>
              <Text
                fontSize="sm"
                color="gray.600"
                fontWeight="semibold"
                mb={0.5}
              >
                Wallet Balance Adjustment{' '}
                <Tooltip label="Your slippage tolerance sets a maximum limit on how much additional collateral Foil can use or the minimum amount of collateral you will receive back, protecting you from unexpected market changes between submitting and processing your transaction.">
                  <QuestionOutlineIcon transform="translateY(-1px)" ml={0.5} />
                </Tooltip>
              </Text>
              <Text fontSize="sm" color="gray.600">
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}{' '}
                → <NumberDisplay value={quotedResultingWalletBalance} />{' '}
                {collateralAssetTicker} (Min.{' '}
                <NumberDisplay
                  value={formatUnits(
                    walletBalanceLimit,
                    collateralAssetDecimals
                  )}
                />{' '}
                {collateralAssetTicker})
              </Text>
            </Box>
          )}
        <Box>
          <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
            Position Collateral
          </Text>
          <Text fontSize="sm" color="gray.600" mb={0.5}>
            <NumberDisplay
              value={formatUnits(
                positionData?.depositedCollateralAmount || BigInt(0),
                collateralAssetDecimals
              )}
            />{' '}
            {collateralAssetTicker} →{' '}
            <NumberDisplay
              value={formatUnits(
                quotedResultingPositionCollateral,
                collateralAssetDecimals
              )}
            />{' '}
            {collateralAssetTicker} (Max.{' '}
            <NumberDisplay
              value={formatUnits(
                positionCollateralLimit,
                collateralAssetDecimals
              )}
            />{' '}
            {collateralAssetTicker})
          </Text>
        </Box>
        {isEdit && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Position Size
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay
                value={formatUnits(originalPositionSize, TOKEN_DECIMALS)}
              />{' '}
              Ggas
              {/* originalPositionSize !== sizeChange && (
                <>
                  {' '}
                  → <NumberDisplay
                    value={formatUnits(sizeChange, TOKEN_DECIMALS)}
                  />{' '}
                  gas
                </>
              ) */}
            </Text>
          </Box>
        )}
        {estimatedFillPrice && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Estimated Fill Price
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay value={estimatedFillPrice} /> Ggas/
              {collateralAssetTicker}
            </Text>
          </Box>
        )}
      </Flex>
    </form>
  );
}
