'use client';

import {
  Box,
  FormControl,
  Text,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
  Divider,
} from '@chakra-ui/react';
import { useContext, useEffect, useState } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';

import useFoilDeployment from './useFoilDeployment';

import { MarketContext } from '~/lib/context/MarketProvider';

const EditLiquidity = () => {
  const account = useAccount();
  const [nftId, setNftId] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [liquidityRatio, setLiquidityRatio] = useState(0);

  const { collateralAsset, chain } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const collateralAmountFunctionResult = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
  });
  const [transactionStep, setTransactionStep] = useState(0); // 0: none, 1: approve sent, 2: approve confirmed, 3: updateLiquidity sent

  const { data: approveHash, writeContract: approveWrite } = useWriteContract();
  const { data: updateLiquidityHash, writeContract: updateLiquidityWrite } =
    useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isSuccess: updateLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: updateLiquidityHash,
  });

  const handleFormSubmit = (e: any) => {
    e.preventDefault();

    approveWrite({
      abi: erc20ABI,
      address: collateralAsset as `0x${string}`,
      functionName: 'approve',
      args: [collateralAsset, BigInt(depositAmount)],
    }); // Start the transaction sequence
    setTransactionStep(1);
  };

  useEffect(() => {
    console.log(
      'Approve Success:',
      approveSuccess,
      'Transaction Step:',
      transactionStep
    );
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2); // Move to the next step once approve is confirmed
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    if (transactionStep === 2) {
      updateLiquidityWrite({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'updateLiquidityPosition',
        args: [nftId, BigInt(depositAmount), BigInt(liquidityRatio)],
      });
      setTransactionStep(3);
    }
  }, [
    transactionStep,
    updateLiquidityWrite,
    nftId,
    depositAmount,
    liquidityRatio,
    foilData.address,
    foilData.abi,
  ]);

  const { data: collectFeesHash, writeContract: collectFeesWrite } =
    useWriteContract();

  const handleClaimRewards = () => {
    collectFeesWrite({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'collectFees',
      args: [nftId],
    });
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <FormControl mb={4}>
        <FormLabel>Collateral Amount</FormLabel>
        <InputGroup>
          <Input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value))}
          />
          <InputRightAddon>cbETH</InputRightAddon>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <FormLabel>Liquidity Ratio</FormLabel>
        <InputGroup>
          <Input
            type="number"
            value={liquidityRatio}
            onChange={(e: any) => setLiquidityRatio(Number(e.target.value))}
          />
        </InputGroup>
      </FormControl>
      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb="1">
          Net Position: X Ggas to X Ggas
        </Text>
        <Text fontSize="sm" color="gray.500" mb="1">
          Wallet Balance: {collateralAmountFunctionResult?.data?.toString()}{' '}
          cbETH to x cbETH
        </Text>
      </Box>
      <Button
        width="full"
        variant="brand"
        type="submit"
        isLoading={transactionStep > 0 && transactionStep < 3}
      >
        Edit Liquidity
      </Button>
      <Divider my={6} />
      <Button width="full" variant="brand" onClick={handleClaimRewards}>
        Claim X stETH Rewards
      </Button>
    </form>
  );
};

export default EditLiquidity;
