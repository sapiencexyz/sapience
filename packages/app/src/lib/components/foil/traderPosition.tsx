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
import type { AbiFunction } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';

import PositionSelector from './positionSelector';
import SlippageTolerance from './slippageTolerance';
import useFoilDeployment from './useFoilDeployment';

import { MarketContext } from '~/lib/context/MarketProvider';

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
  const account = useAccount();
  const [nftId, setNftId] = useState(0);
  const [collateral, setCollateral] = useState<bigint>(BigInt(0));
  const [size, setSize] = useState<bigint>(BigInt(0));
  const options = ['Long', 'Short'];
  const [option, setOption] = useState('Long');
  const [transactionStep, setTransactionStep] = useState(0);
  const { isConnected } = account;

  const {
    chain,
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
  } = React.useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const referencePriceFunctionResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getReferencePrice',
    chainId: chain?.id,
  });

  const collateralAmountFunctionResult = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
    chainId: chain?.id,
  });

  const getPositionDataFunctionResult = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPositionData',
    args: [nftId],
    chainId: chain?.id,
  });

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

  const handleSubmit = (e: any) => {
    e.preventDefault();

    approveWrite({
      abi: erc20ABI as AbiFunction[],
      address: collateralAsset as `0x${string}`,
      functionName: 'approve',
      args: [collateralAsset, BigInt(collateral)],
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
      const finalSize = option === 'Short' ? -Math.abs(Number(size)) : size;

      if (nftId === 0) {
        writeContract({
          abi: foilData.abi,
          address: foilData.address as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [
            parseUnits(collateral.toString(), collateralAssetDecimals),
            parseUnits(finalSize.toString(), collateralAssetDecimals),
          ],
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
  ]);

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
  }, [toast, isConfirmed, nftId]);

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
    /*
    TODO
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
      */
  }, [nftId, getPositionDataFunctionResult?.data]);

  const [slippage, setSlippage] = useState<number>(0.5);

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
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
            value={show ? Number(size) : Number(collateral)}
            type="number"
            onChange={(e: any) =>
              show ? setSize(e.target.value) : setCollateral(e.target.value)
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
          <Input
            readOnly
            value={show ? Number(collateral) : Number(size)}
            type="number"
          />
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
