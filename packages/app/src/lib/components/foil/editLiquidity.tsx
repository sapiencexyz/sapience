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
import { useEffect, useState } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/Token.json';
import Foil from '../../../../deployments/Foil.json';

const EditLiquidity = ({
  params,
}: {
  params: { mode: string; selectedData: JSON };
}) => {
  const account = useAccount();
  const [nftId, setNftId] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [liquidityRatio, setLiquidityRatio] = useState(0);

  const collateralAmountFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: CollateralAsset.address as `0x${string}`,
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

  const handleFormSubmit = (e) => {
    e.preventDefault();

    approveWrite({
      abi: CollateralAsset.abi,
      address: CollateralAsset.address,
      functionName: 'approve',
      args: [CollateralAsset.address, BigInt(depositAmount)],
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
        address: Foil.address,
        abi: Foil.abi,
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
  ]);
  
  const { data: collectFeesHash, writeContract: collectFeesWrite } = useWriteContract();

  const handleClaimRewards = () => {
    collectFeesWrite({
      address: Foil.address,
      abi: Foil.abi,
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
            onChange={(e) => setLiquidityRatio(Number(e.target.value))}
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
