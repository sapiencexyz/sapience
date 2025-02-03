import { useContext, useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { zeroAddress } from 'viem';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useToast } from '../../hooks/use-toast';
import erc20ABI from '~/lib/erc20abi.json';
import useFoilDeployment from '~/components/useFoilDeployment';

type Props = {
  amount: bigint;
  collateralAsset: `0x${string}`;
  vaultData: {
    abi: any;
    address: `0x${string}`;
  };
};

export const useVaultDeposit = ({
  amount,
  collateralAsset,
  vaultData,
}: Props) => {
  const { address, chainId } = useAccount();
  const { toast } = useToast();
  const [pendingTxn, setPendingTxn] = useState(false);

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset,
    functionName: 'allowance',
    args: [address, vaultData.address],
    account: (address || zeroAddress) as `0x${string}`,
    chainId,
  });

  // Write contract hooks
  const { data: hash, writeContract: depositWrite } = useWriteContract({
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
    if (approveSuccess) {
      refetchAllowance();
      setPendingTxn(false);
    }
  }, [approveSuccess, refetchAllowance]);

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: 'Success',
        description: 'Your deposit request has been confirmed.',
      });
      setPendingTxn(false);
    }
  }, [isConfirmed, toast, setPendingTxn]);

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: 'Success',
        description: 'Your deposit request has been confirmed.',
      });
      setPendingTxn(false);
    }
  }, [isConfirmed, toast, setPendingTxn]);

  const requestDeposit = async () => {
    if (!address) return;
    setPendingTxn(true);
    if (amount > 0) {
      depositWrite({
        abi: vaultData.abi,
        address: vaultData.address,
        functionName: 'requestDeposit',
        args: [amount],
      });
    } else {
      depositWrite({
        abi: vaultData.abi,
        address: vaultData.address,
        functionName: 'withdrawRequestDeposit',
        args: [BigInt(Math.abs(Number(amount)))],
      });
    }
  };

  const approve = async () => {
    if (!address) return;
    setPendingTxn(true);
    approveWrite({
      abi: erc20ABI,
      address: collateralAsset,
      functionName: 'approve',
      args: [vaultData.address, amount],
    });
  };

  const deposit = async () => {
    if (!address) return;
    setPendingTxn(true);
    depositWrite({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'deposit',
      args: [0, address],
    });
  };

  return {
    allowance: (allowance || BigInt(0)) as bigint,
    requestDeposit,
    deposit,
    approve,
    pendingTxn,
    isDepositConfirmed: isConfirmed,
    isApproveConfirmed: approveSuccess,
  };
};
