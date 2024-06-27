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
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/MintableToken.json';
import Foil from '../../../../deployments/Foil.json';

import PositionSelector from './positionSelector';

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
  const [collateral, setCollateral] = useState(0);
  const [size, setSize] = useState(0);
  const options = ['Long', 'Short'];
  const [option, setOption] = useState('Long');
  const [transactionStep, setTransactionStep] = useState(0);

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
          args: [collateral, finalSize],
        });
      } else {
        writeContract({
          abi: Foil.abi,
          address: Foil.address as `0x${string}`,
          functionName: 'updateTraderPosition',
          args: [nftId, collateral, finalSize],
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
            value={size}
            type="number"
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <InputRightElement width="4.5rem">
            <Button h="1.75rem" size="sm" onClick={handleClick}>
              {show ? 'cbETH' : 'Ggas'}
            </Button>
          </InputRightElement>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <InputGroup>
          <Input
            value={collateral}
            type="number"
            onChange={(e) => setCollateral(Number(e.target.value))}
          />
          <InputRightAddon>{show ? 'Ggas' : 'cbETH'}</InputRightAddon>
        </InputGroup>
      </FormControl>
      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb={0.5}>
          Position: X Ggas to X Ggas
        </Text>
        <Text fontSize="sm" color="gray.500" mb={0.5}>
          Wallet Balance: X cbETH to x cbETH
        </Text>
      </Box>
      <Button
        width="full"
        variant="brand"
        type="submit"
        isLoading={transactionStep > 0 && transactionStep < 3}
      >
        Trade
      </Button>
    </form>
  );
}
