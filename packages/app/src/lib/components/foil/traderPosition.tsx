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
import * as React from 'react';
import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/Token.json';
import Foil from '../../../../deployments/Foil.json';

import PositionSelector from './positionSelector';

import { MarketContext } from '~/lib/context/MarketProvider';
import SlippageTolerance from './slippageTolerance';

function RadioCard(props) {
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

export default function TraderPosition({ params }) {
  const account = useAccount();
  const [nftId, setNftId] = useState(0);
  const [collateral, setCollateral] = useState<bigint>(0n);
  const [size, setSize] = useState<bigint>(0n);
  const options = ['Long', 'Short'];
  const [option, setOption] = useState('Long');
  const [transactionStep, setTransactionStep] = useState(0);
  const { isConnected } = account;

  const chainId = 13370;

  const referencePriceFunctionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getReferencePrice',
    chainId,
  });

  const collateralAmountFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: CollateralAsset.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
    chainId,
  });

  const getPositionDataFunctionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getPositionData',
    args: [nftId],
    chainId,
  });

  const { collateralAssetTicker, collateralAssetDecimals } =
    React.useContext(MarketContext);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'positionType',
    defaultValue: 'Long',
    onChange: setOption,
  });

  const group = getRootProps();

  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);

  const toast = useToast();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { data: approveHash, writeContract: approveWrite } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    approveWrite({
      abi: CollateralAsset.abi,
      address: CollateralAsset.address,
      functionName: 'approve',
      args: [CollateralAsset.address, BigInt(collateral)],
    }); // Start the transaction sequence
    setTransactionStep(1);
  };

  React.useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2); // Move to the next step once approve is confirmed
    }
  }, [approveSuccess, transactionStep]);

  React.useEffect(() => {
    if (transactionStep === 2) {
      const finalSize = option === 'Short' ? -Math.abs(size) : size;

      if (nftId === 0) {
        writeContract({
          abi: Foil.abi,
          address: Foil.address as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [
            parseUnits(collateral.toString(), collateralAssetDecimals),
            parseUnits(finalSize.toString(), collateralAssetDecimals),
          ],
        });
      } else {
        writeContract({
          abi: Foil.abi,
          address: Foil.address as `0x${string}`,
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
  }, [transactionStep, writeContract, nftId, collateral, size, option]);

  React.useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: 'There was an issue creating/updating your position.',
        status: 'error',
        duration: 9000,
        isClosable: true,
      });
    } else if (hash) {
      toast({
        title: 'Submitted',
        description: 'Transaction submitted. Waiting for confirmation...',
        status: 'info',
        duration: 9000,
        isClosable: true,
      });
    }
  }, [toast, error, hash]);

  React.useEffect(() => {
    if (isConfirmed) {
      toast({
        title: 'Success',
        description: `We've ${
          nftId === 0 ? 'created' : 'updated'
        } your position for you.`,
        status: 'success',
        duration: 9000,
        isClosable: true,
      });
    }
  }, [toast, isConfirmed]);

  React.useEffect(() => {
    setCollateral(
      BigInt(size) * BigInt(referencePriceFunctionResult?.data?.toString() || 0)
    );
  }, [referencePriceFunctionResult?.data, size]);

  React.useEffect(() => {
    setSize(
      BigInt(collateral) /
        BigInt(referencePriceFunctionResult?.data?.toString() || 1)
    );
  }, [collateral, referencePriceFunctionResult?.data]);

  React.useEffect(() => {
    if (nftId > 0) {
      setSize(
        BigInt(
          Math.abs(getPositionDataFunctionResult?.data?.currentTokenAmount) || 0
        )
      );
      setOption(
        getPositionDataFunctionResult?.data?.currentTokenAmount >= 0
          ? 'Long'
          : 'Short'
      );
    }
  }, [nftId, getPositionDataFunctionResult?.data]);

  const [slippage, setSlippage] = useState<number>(0.5);

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
    console.log(`Slippage tolerance updated to: ${newSlippage}%`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PositionSelector isLP={false} onChange={setNftId} />
      <Flex {...group} gap={4} mb={4}>
        {options.map((value) => {
          const radio = getRadioProps({ value });
          return (
            <RadioCard key={value} {...radio}>
              {value}
            </RadioCard>
          );
        })}
      </Flex>
      <FormControl mb={4}>
        <FormLabel>Size</FormLabel>
        <InputGroup>
          <Input
            value={show ? size : collateral}
            type="number"
            onChange={(e) =>
              show
                ? setSize(Number(e.target.value))
                : setCollateral(Number(e.target.value))
            }
          />
          <InputRightElement width="4.5rem">
            <Button h="1.75rem" size="sm" onClick={handleClick}>
              {show ? collateralAssetTicker : 'Ggas'}
            </Button>
          </InputRightElement>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <InputGroup>
          <Input readOnly value={show ? collateral : size} type="number" />
          <InputRightAddon>
            {show ? 'Ggas' : collateralAssetTicker}
          </InputRightAddon>
        </InputGroup>
      </FormControl>
      <SlippageTolerance onSlippageChange={handleSlippageChange} />
      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb={0.5}>
          Position: X Ggas to X Ggas
        </Text>
        {isConnected && collateralAmountFunctionResult?.data && (
          <Text fontSize="sm" color="gray.500" mb="0.5">
            Wallet Balance:{' '}
            {formatUnits(
              collateralAmountFunctionResult.data.toString(),
              collateralAssetDecimals
            )}{' '}
            {collateralAssetTicker}
          </Text>
        )}
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={transactionStep > 0 && transactionStep < 3}
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
