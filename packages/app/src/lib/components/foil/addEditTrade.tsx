import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Flex,
  Box,
  useRadioGroup,
  Button,
  Text,
  useToast,
  Tooltip,
  Heading,
} from '@chakra-ui/react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState, useEffect, useContext, useMemo } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { decodeEventLog, formatUnits, parseUnits, zeroAddress } from 'viem';
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
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';
import SizeInput from './sizeInput';
import SlippageTolerance from './slippageTolerance';

const tradeOptions = ['Long', 'Short'];

export default function AddEditTrade() {
  const { nftId, refreshPositions } = useAddEditPosition();
  const [sizeChange, setSizeChange] = useState<bigint>(BigInt(0));
  const [option, setOption] = useState<'Long' | 'Short'>('Long');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [quotedResultingWalletBalance, setQuotedResultingWalletBalance] =
    useState<string>('0');
  const [walletBalanceLimit, setWalletBalanceLimit] = useState<bigint>(
    BigInt(0)
  );
  const [positionCollateralLimit, setPositionCollateralLimit] =
    useState<bigint>(BigInt(0));
  const [resultingPositionCollateral, setResultingPositionCollateral] =
    useState<bigint>(BigInt(0));

  const account = useAccount();
  const { isConnected, address } = account;
  const isEdit = !!nftId;

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

  // Position data
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

  const originalPositionSizeInContractUnit: bigint = useMemo(() => {
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

  const sizeChangeInContractUnit = useMemo(() => {
    return sizeChange * BigInt(1e9); // Convert sizeChange from gas to Ggas with 18 decimals
  }, [sizeChange]);

  const desiredSizeInContractUnit = useMemo(() => {
    return originalPositionSizeInContractUnit + sizeChangeInContractUnit;
  }, [originalPositionSizeInContractUnit, sizeChangeInContractUnit]);

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
    sizeChangeInContractUnit,
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

  const { isSuccess: isConfirmed, data: transactionReceipt } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      if (isEdit) {
        renderToast(toast, `We've updated your position for you.`);
        resetAfterSuccess();
      } else {
        for (const log of transactionReceipt.logs) {
          try {
            const event = decodeEventLog({
              abi: foilData.abi,
              data: log.data,
              topics: log.topics,
            });

            if ((event as any).eventName === 'TraderPositionCreated') {
              const nftId = (event as any).args.positionId.toString();
              renderToast(
                toast,
                `Your position has been created as position ${nftId}`
              );
              resetAfterSuccess();
              return;
            }
          } catch (error) {
            // This log was not for the TraderPositionCreated event, continue to next log
          }
        }
        renderToast(toast, `We've created your position for you.`);
        resetAfterSuccess();
      }
    }
  }, [isConfirmed, transactionReceipt]);

  useEffect(() => {
    if (approveSuccess) {
      const handleSuccess = async () => {
        await refetchAllowance();
        handleSubmit(undefined, true);
      };
      handleSuccess();
    }
  }, [approveSuccess]);

  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;

    if (!result) {
      return [BigInt(0), BigInt(0)];
    }

    if (isEdit) {
      const [expectedCollateralDelta, closePnL, fillPrice] = result;
      return [expectedCollateralDelta, fillPrice];
    }
    const [requiredCollateral, fillPrice] = result;
    return [requiredCollateral, fillPrice];
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  const priceImpact: number = useMemo(() => {
    if (pool?.token0Price && quotedFillPrice) {
      const fillPrice = Number(quotedFillPrice) / 1e18;
      const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
      return Math.abs((fillPrice / referencePrice - 1) * 100);
    }
    return 0;
  }, [quotedFillPrice, pool]);

  const collateralDeltaLimit = useMemo(() => {
    if (quotedCollateralDelta === BigInt(0)) return BigInt(0);

    const slippageMultiplier = BigInt(Math.floor((100 + slippage) * 100));
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - slippage) * 100)
    );

    if (quotedCollateralDelta > BigInt(0)) {
      return (quotedCollateralDelta * slippageMultiplier) / BigInt(10000);
    }

    return (
      (quotedCollateralDelta * slippageReductionMultiplier) / BigInt(10000)
    );
  }, [quotedCollateralDelta, slippage]);

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement>,
    approved?: boolean
  ) => {
    if (e) e.preventDefault();
    setPendingTxn(true);

    // Set deadline to 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    if (!allowance) {
      console.log('refetching  allowance...');
      await refetchAllowance();
      console.log('refetched  allowance =', allowance);
    }
    console.log('Allowance ', allowance);
    if (
      !approved &&
      allowance !== undefined &&
      collateralDeltaLimit > (allowance as bigint)
    ) {
      console.log('Approving ', collateralDeltaLimit);
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
          collateralDeltaLimit,
          deadline,
        ],
      });
    } else {
      console.log(
        'Creating trade position....',
        epoch,
        desiredSizeInContractUnit,
        collateralDeltaLimit,
        deadline
      );
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [
          epoch,
          desiredSizeInContractUnit,
          collateralDeltaLimit,
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
  };

  const resetAfterSuccess = () => {
    setSizeChange(BigInt(0));
    setSlippage(0.5);
    setPendingTxn(false);
    refreshPositions();
    refetchPositionData();
    refetchUniswapData();
    refetchAllowance();
  };

  useEffect(() => {
    if (collateralBalance) {
      const newWalletBalance = formatUnits(
        collateralBalance as bigint,
        collateralAssetDecimals
      );
      setWalletBalance(newWalletBalance);

      const newQuotedResultingWalletBalance = formatUnits(
        (collateralBalance as bigint) - quotedCollateralDelta,
        collateralAssetDecimals
      );
      setQuotedResultingWalletBalance(newQuotedResultingWalletBalance);

      const newWalletBalanceLimit =
        parseUnits(newWalletBalance, collateralAssetDecimals) -
        collateralDeltaLimit;
      setWalletBalanceLimit(newWalletBalanceLimit);
    }

    const newPositionCollateralLimit =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      collateralDeltaLimit;
    setPositionCollateralLimit(newPositionCollateralLimit);

    const newResultingPositionCollateral =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      quotedCollateralDelta;
    setResultingPositionCollateral(newResultingPositionCollateral);
  }, [
    collateralBalance,
    collateralAssetDecimals,
    collateralDeltaLimit,
    positionData,
  ]);

  // console.log('******');
  // console.log('collateralBalance =', collateralBalance);
  // console.log('collateralAssetDecimals =', collateralAssetDecimals);
  // console.log('quotedCollateralDelta =', quotedCollateralDelta);
  // console.log('collateralDeltaLimit =', collateralDeltaLimit);
  // console.log('positionData =', positionData);
  // console.log('walletBalance =', walletBalance);
  // console.log('quotedResultingWalletBalance =', quotedResultingWalletBalance);
  // console.log('walletBalanceLimit =', walletBalanceLimit);
  // console.log('positionCollateralLimit =', positionCollateralLimit);
  // console.log('quotedFillPrice =', quotedFillPrice);
  // console.log('pool?.token0Price =', pool?.token0Price);
  // console.log('******');

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
          sizeChangeInContractUnit === BigInt(0)
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
      <Heading size="md" mb={3}>
        Trade
      </Heading>
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
        <PositionSelector isLP={false} />
        {isEdit && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Position Size
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay
                value={formatUnits(
                  originalPositionSizeInContractUnit,
                  TOKEN_DECIMALS
                )}
              />{' '}
              Ggas
              {sizeChangeInContractUnit !== BigInt(0) && (
                <>
                  {' '}
                  →{' '}
                  <NumberDisplay
                    value={formatUnits(
                      desiredSizeInContractUnit,
                      TOKEN_DECIMALS
                    )}
                  />{' '}
                  Ggas
                </>
              )}
            </Text>
          </Box>
        )}
        {!isLoadingCollateralChange && isConnected && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Wallet Balance
              {sizeChange !== BigInt(0) && (
                <Tooltip label="Your slippage tolerance sets a maximum limit on how much additional collateral Foil can use or the minimum amount of collateral you will receive back, protecting you from unexpected market changes between submitting and processing your transaction.">
                  <QuestionOutlineIcon transform="translateY(-1px)" ml={0.5} />
                </Tooltip>
              )}
            </Text>
            <Text fontSize="sm" color="gray.600">
              <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
              {sizeChange !== BigInt(0) && !quoteError && (
                <>
                  {' '}
                  → <NumberDisplay value={quotedResultingWalletBalance} />{' '}
                  {collateralAssetTicker} (Min.{' '}
                  <NumberDisplay
                    value={formatUnits(
                      walletBalanceLimit,
                      collateralAssetDecimals
                    )}
                  />{' '}
                  {collateralAssetTicker})
                </>
              )}
            </Text>
          </Box>
        )}
        {!isLoadingCollateralChange && (
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
              {collateralAssetTicker}
              {sizeChange !== BigInt(0) && !quoteError && (
                <>
                  {' '}
                  →{' '}
                  <NumberDisplay
                    value={formatUnits(
                      resultingPositionCollateral,
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
                </>
              )}
            </Text>
          </Box>
        )}
        {quotedFillPrice && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Estimated Fill Price
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay value={quotedFillPrice} /> Ggas/
              {collateralAssetTicker}
            </Text>
          </Box>
        )}
        {priceImpact !== 0 && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Estimated Price Impact
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              {Number(priceImpact.toFixed(2)).toString()}%
            </Text>
          </Box>
        )}
      </Flex>
    </form>
  );
}
