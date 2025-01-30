import { useContext, useEffect, useState } from 'react';
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { erc20ABI } from 'viem';
import { zeroAddress } from 'viem';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useToast } from '../../hooks/use-toast';

export const useVaultDeposit = () => {
  const { toast } = useToast();
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnStep, setTxnStep] = useState(0);
  const {
    address: marketAddress,
    chainId,
    collateralAsset,
    address,
    foilData,
  } = useContext(PeriodContext);

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, marketAddress],
    account: address || zeroAddress,
    chainId,
  });

  // Write contract hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `There was an issue depositing: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Transaction Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Approval Failed',
          description: `Failed to approve: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      toast({
        title: 'Success',
        description: 'Your deposit has been confirmed.',
      });
      setPendingTxn(false);
      setTxnStep(0);
    }
  }, [isConfirmed, txnStep, toast, setPendingTxn, setTxnStep]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      refetchAllowance();
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'deposit',
        args: [amount],
      });
      setTxnStep(2);
    }
  }, [
    marketAddress,
    approveSuccess,
    txnStep,
    writeContract,
    refetchAllowance,
    foilData.abi,
  ]);

  const deposit = async (amount: bigint) => {
    if (!address) return;
    setPendingTxn(true);

    if (!allowance || allowance < amount) {
      approveWrite({
        abi: erc20ABI,
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, amount],
      });
      setTxnStep(1);
    } else {
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'deposit',
        args: [amount],
      });
      setTxnStep(2);
    }
  };

  return {
    deposit,
    pendingTxn,
  };
};
