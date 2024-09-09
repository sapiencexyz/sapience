import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Flex,
  Box,
  useRadio,
  useRadioGroup,
  Button,
  Text,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import { useState, useEffect, useContext } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import PositionSelector from './positionSelector';
import SizeInput from './sizeInput';
import SlippageTolerance from './slippageTolerance';

const tradeOptions = ['Long', 'Short'];

function RadioCard(props: any) {
  const { getInputProps, getRadioProps } = useRadio(props);

  const input = getInputProps();
  const checkbox = getRadioProps();

  return (
    <Box flex="1" as="label">
      <input {...input} />
      <Box
        {...checkbox}
        textAlign="center"
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="md"
        fontWeight={700}
        _hover={{
          bg: 'gray.100',
        }}
        _checked={{
          cursor: 'normal',
          bg: 'gray.800',
          color: 'white',
          borderColor: 'gray.800',
          boxShadow: 'none',
        }}
        _focus={{
          boxShadow: 'outline',
        }}
        p={2}
      >
        {props.children}
      </Box>
    </Box>
  );
}

export default function TraderPosition({}) {
  const [nftId, setNftId] = useState(0);
  const [size, setSize] = useState<number>(0);
  const [option, setOption] = useState('Long');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));

  const account = useAccount();
  const { isConnected, address } = account;
  const { tokenIds, refetch: refetchTokens } = useTokenIdsOfOwner(
    address as `0x${string}`
  );
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
  } = useContext(MarketContext);

  const refPrice = pool?.token0Price.toSignificant(3);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'positionType',
    defaultValue: 'Long',
    onChange: setOption,
    value: option,
  });
  const group = getRootProps();
  const toast = useToast();

  const isLong = option === 'Long';

  // Collateral balance for current address/account
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
    chainId,
  });

  // Allowance check
  const { data: allowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, foilData.address],
    chainId,
  });

  // Quote functions
  const quoteCreatePositionResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [
      epoch,
      parseUnits(size.toString(), collateralAssetDecimals) *
        (isLong ? BigInt(1) : BigInt(-1)),
    ],
    chainId,
    query: { enabled: !isEdit && size !== 0 },
  });

  const quoteModifyPositionResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [
      nftId,
      parseUnits(size.toString(), collateralAssetDecimals) *
        (isLong ? BigInt(1) : BigInt(-1)),
    ],
    chainId,
    query: { enabled: isEdit },
  });

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
      handleSubmit();
    }
  }, [approveSuccess]);

  useEffect(() => {
    const quoteResult = isEdit
      ? quoteModifyPositionResult.data
      : quoteCreatePositionResult.data;
    if (quoteResult) {
      setCollateralDelta(quoteResult as bigint);
    }
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setPendingTxn(true);
    setIsLoading(true);

    const sizeInTokens =
      parseUnits(size.toString(), collateralAssetDecimals) *
      (isLong ? BigInt(1) : BigInt(-1));

    // Calculate collateralDeltaLimit using refPrice
    const collateralDeltaLimit = calculateCollateralDeltaLimit(
      collateralDelta,
      slippage,
      refPrice
    );

    if (allowance && collateralDeltaLimit > (allowance as bigint)) {
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
        args: [nftId, sizeInTokens, collateralDeltaLimit],
      });
    } else {
      writeContract({
        abi: foilData.abi,
        address: foilData.address as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [epoch, sizeInTokens, collateralDeltaLimit],
      });
    }
  };

  const calculateCollateralDeltaLimit = (
    collateralDelta: bigint,
    slippage: number,
    refPrice: string | undefined
  ) => {
    if (!refPrice) {
      // Fallback to the original calculation if refPrice is not available
      return (
        (collateralDelta * BigInt(Math.floor((100 + slippage) * 100))) /
        BigInt(10000)
      );
    }

    const refPriceBigInt = BigInt(Math.floor(parseFloat(refPrice) * 1e18)); // Convert to BigInt with 18 decimals precision
    const slippageFactor = BigInt(Math.floor((100 + slippage) * 1e16)); // Convert slippage to BigInt with 18 decimals precision

    // Calculate the limit based on the reference price and slippage
    return (
      (collateralDelta * refPriceBigInt * slippageFactor) /
      (BigInt(100) * BigInt(1e18))
    );
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
    refetchTokens();
  };

  const formatBalance = (balance: bigint) => {
    return Number(formatUnits(balance, collateralAssetDecimals)).toFixed(4);
  };

  const currentBalance = collateralBalance
    ? formatBalance(collateralBalance as bigint)
    : '0';
  const estimatedNewBalance = collateralBalance
    ? formatBalance((collateralBalance as bigint) - collateralDelta)
    : '0';
  const minResultingBalance =
    collateralBalance && refPrice
      ? formatBalance(
          (collateralBalance as bigint) -
            calculateCollateralDeltaLimit(collateralDelta, slippage, refPrice)
        )
      : '0';

  return (
    <form onSubmit={handleSubmit}>
      <PositionSelector
        isLP={false}
        onChange={setNftId}
        nftIds={tokenIds}
        value={nftId}
      />
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
      <SizeInput nftId={nftId} size={size} setSize={setSize} />
      <SlippageTolerance onSlippageChange={handleSlippageChange} />
      <Box mb={4}>
        <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
          Estimated Wallet Balance Adjustment{' '}
          <Tooltip label="Your slippage tolerance sets a maximum limit on how much additional collateral Foil can use, protecting you from unexpected market changes between submitting and processing your transaction.">
            <QuestionOutlineIcon transform="translateY(-1px)" ml={0.5} />
          </Tooltip>
        </Text>
        <Text fontSize="sm" color="gray.600">
          {currentBalance} {collateralAssetTicker} → {estimatedNewBalance}{' '}
          {collateralAssetTicker} (Min. {minResultingBalance}{' '}
          {collateralAssetTicker})
        </Text>
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={pendingTxn}
          isDisabled={pendingTxn}
        >
          {isEdit ? 'Update Position' : 'Create Position'}
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit">
          Connect Wallet
        </Button>
      )}
    </form>
  );
}
