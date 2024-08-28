import {
  Flex,
  FormControl,
  Input,
  InputGroup,
  InputRightAddon,
  Box,
  useRadio,
  useRadioGroup,
  Button,
  InputRightElement,
  FormLabel,
  Text,
  useToast,
} from '@chakra-ui/react';
import { useState, useEffect, useContext, useMemo } from 'react';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { TOKEN_DECIMALS } from '~/lib/constants/constants';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import {
  convertHundredthsOfBipToPercent,
  renderContractErrorToast,
  renderToast,
} from '~/lib/util/util';

import PositionSelector from './positionSelector';
import SlippageTolerance from './slippageTolerance';

const tradeOptions = ['Long', 'Short'];
const PRECISION = 12;

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
  const [collateral, setCollateral] = useState<number>(0);
  const [size, setSize] = useState<number>(0);
  const [option, setOption] = useState('Long');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [transactionStep, setTransactionStep] = useState(0);
  const [isSizeInput, setIsSizeInput] = useState(false);
  const [pendingTxn, setPendingTxn] = useState(false);
  const account = useAccount();
  const { isConnected } = account;
  const { address } = useAccount();
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
    pool,
    foilData,
    chainId,
  } = useContext(MarketContext);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'positionType',
    defaultValue: 'Long',
    onChange: setOption,
    value: option,
  });
  const group = getRootProps();
  const toast = useToast();

  const isLong = option === 'Long';
  const fee = convertHundredthsOfBipToPercent(pool?.fee || 0) + 0.01; // TODO FIGURE OUT WHAT THIS SHOULD BE

  /// //// READ CONTRACT HOOKS ///////
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  const referencePriceFunctionResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getReferencePrice',
    chainId,
    args: [epoch],
  });

  const collateralAmountFunctionResult = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
    chainId,
  });

  /// //// WRITE CONTRACT HOOKS ///////
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
    },
  });

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  /// //// USE EFFECTS ///////
  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2); // Move to the next step once approve is confirmed
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    if (transactionStep === 2) {
      const finalSize = !isLong ? -Math.abs(Number(size)) : size;
      const tokenAmountLimit = finalSize * (1 - slippage / 100);
      const args = [
        epoch,
        parseUnits(collateral.toString(), collateralAssetDecimals),
        parseUnits(finalSize.toString(), collateralAssetDecimals),
        parseUnits('0', collateralAssetDecimals),
        // parseUnits(tokenAmountLimit.toString(), collateralAssetDecimals),
      ];
      console.log('args', args);
      if (nftId === 0) {
        writeContract({
          abi: foilData.abi,
          address: foilData.address as `0x${string}`,
          functionName: 'createTraderPosition',
          args,
        });
      } else {
        writeContract({
          abi: foilData.abi,
          address: foilData.address as `0x${string}`,
          functionName: 'updateTraderPosition',
          args: [
            nftId,
            parseUnits(collateral.toString(), collateralAssetDecimals),
            parseUnits(finalSize.toString(), collateralAssetDecimals),
          ],
        });
      }
      setTransactionStep(3);
    }
  }, [
    transactionStep,
    writeContract,
    nftId,
    collateral,
    size,
    option,
    collateralAssetDecimals,
    foilData.abi,
    foilData.address,
    pool,
  ]);

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
    if (isEdit && positionData) {
      setOption(positionData.currentTokenAmount >= 0 ? 'Long' : 'Short');
    }
  }, [isEdit, positionData]);

  /// /// MEMOIZED FUNCTIONS ///////
  const originalCollateral = useMemo(() => {
    if (!positionData) return '0';
    return formatUnits(
      positionData.depositedCollateralAmount,
      collateralAssetDecimals
    );
  }, [positionData, collateralAssetDecimals]);

  const originalSize = useMemo(() => {
    if (!positionData) return '0';
    return formatUnits(
      positionData.currentTokenAmount,
      collateralAssetDecimals
    );
  }, [positionData, collateralAssetDecimals]);

  /// /// HANDLERS //////
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPendingTxn(true);
    setIsLoading(true);
    approveWrite({
      abi: erc20ABI as AbiFunction[],
      address: collateralAsset as `0x${string}`,
      functionName: 'approve',
      args: [
        foilData.address,
        parseUnits(collateral.toString(), collateralAssetDecimals),
      ],
    }); // Start the transaction sequence
    setTransactionStep(1);
  };

  /**
   * Update size and collateral based on the new size input
   * @param newVal - new value of the size input
   */
  const handleSizeChange = (newVal: string) => {
    const refPrice = referencePriceFunctionResult?.data;
    if (!refPrice) return;
    const newSize = parseFloat(newVal || '0');
    setSize(newSize);
    const refPriceNumber = formatUnits(refPrice as bigint, TOKEN_DECIMALS);
    const newCollateral =
      parseFloat(`${newSize * (1 + fee)}`) * parseFloat(refPriceNumber);
    setCollateral(parseFloat(newCollateral.toFixed(PRECISION)));
  };

  /**
   * Update size and collateral based on the new collateral input
   * @param newVal - new value of the collateral input
   */
  const handleCollateralChange = (newVal: string) => {
    const refPrice = referencePriceFunctionResult?.data;
    if (!refPrice) return;
    const newCollateral = parseFloat(newVal || '0');
    setCollateral(newCollateral);
    const refPriceNumber = formatUnits(refPrice as bigint, TOKEN_DECIMALS);
    const newSize = (newCollateral * (1 - fee)) / parseFloat(refPriceNumber);
    setSize(parseFloat(newSize.toFixed(PRECISION)));
  };

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
  };

  const handleUpdateIsSizeInput = () => setIsSizeInput(!isSizeInput);

  const resetAfterError = () => {
    setTransactionStep(0);
    setPendingTxn(false);
    setIsLoading(false);
  };

  const resetAfterSuccess = () => {
    // reset form states
    setSize(0);
    setCollateral(0);
    setSlippage(0.5);

    setTransactionStep(0);
    setPendingTxn(false);
    setIsLoading(false);

    refetchTokens();
    refetchPosition();
    // to do ....refetch states....
  };

  return (
    <form onSubmit={handleSubmit}>
      <PositionSelector isLP={false} onChange={setNftId} nftIds={tokenIds} />
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
      <FormControl mb={4}>
        <FormLabel>Size (is size input? {`${isSizeInput}`}) </FormLabel>
        <InputGroup>
          <Input
            value={isSizeInput ? Number(size) : Number(collateral)}
            type="number"
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) =>
              isSizeInput
                ? handleSizeChange(e.target.value)
                : handleCollateralChange(e.target.value)
            }
          />
          <InputRightAddon width="4.5rem">
            <Button h="1.75rem" size="sm" onClick={handleUpdateIsSizeInput}>
              {isSizeInput ? 'Ggas' : collateralAssetTicker}
            </Button>
          </InputRightAddon>
        </InputGroup>
        <Text hidden={!isEdit} fontSize="small">
          Original value: {isSizeInput ? originalSize : originalCollateral}
        </Text>
      </FormControl>
      <FormControl mb={4}>
        <InputGroup>
          <Input
            readOnly
            value={isSizeInput ? Number(collateral) : Number(size)}
            type="number"
          />
          <InputRightAddon>
            {isSizeInput ? collateralAssetTicker : 'Ggas'}
          </InputRightAddon>
        </InputGroup>
        <Text hidden={!isEdit} fontSize="small">
          Original value: {!isSizeInput ? originalSize : originalCollateral}
        </Text>
      </FormControl>
      <SlippageTolerance onSlippageChange={handleSlippageChange} />
      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb={0.5}>
          Position: X Ggas to X Ggas
        </Text>
        {isConnected && (
          <Text fontSize="sm" color="gray.500" mb="0.5">
            Wallet Balance:{' '}
            {collateralAmountFunctionResult?.data
              ? formatUnits(
                  BigInt(collateralAmountFunctionResult.data.toString()),
                  collateralAssetDecimals
                )
              : null}{' '}
            {collateralAssetTicker}
          </Text>
        )}
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={pendingTxn}
          isDisabled={pendingTxn}
        >
          Trade
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit">
          Connect Wallet
        </Button>
      )}
    </form>
  );
}
