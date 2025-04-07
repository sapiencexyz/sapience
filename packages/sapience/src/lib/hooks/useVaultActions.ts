import { useEffect, useState } from 'react';
import { zeroAddress } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { useToast } from '@foil/ui/hooks/use-toast';
import erc20ABI from '~/lib/erc20abi.json';

type Props = {
  amount: bigint;
  collateralAsset?: `0x${string}`;
  vaultData?: {
    abi: any;
    address: `0x${string}`;
  } | null;
  type: 'deposit' | 'withdraw';
};

export const useVaultActions = ({
  amount,
  collateralAsset,
  vaultData,
  type,
}: Props) => {
  const { address, chainId } = useAccount();
  const { toast } = useToast();
  const [pendingTxn, setPendingTxn] = useState(false);

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: type === 'deposit' ? collateralAsset : vaultData?.address,
    functionName: 'allowance',
    args: [address || zeroAddress, vaultData?.address || zeroAddress],
    account: (address || zeroAddress) as `0x${string}`,
    chainId,
    query: {
      enabled: !!address && !!vaultData && !!collateralAsset,
    },
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
        description: 'Your request has been confirmed.',
      });
      setPendingTxn(false);
    }
  }, [isConfirmed, toast, setPendingTxn]);

  const createRequest = async () => {
    if (!address || !vaultData) return;
    setPendingTxn(true);
    if (amount > 0) {
      depositWrite({
        abi: vaultData.abi,
        address: vaultData.address,
        functionName: type === 'deposit' ? 'requestDeposit' : 'requestRedeem',
        args: [amount],
      });
    } else {
      depositWrite({
        abi: vaultData.abi,
        address: vaultData.address,
        functionName:
          type === 'deposit'
            ? 'withdrawRequestDeposit'
            : 'withdrawRequestRedeem',
        args: [BigInt(Math.abs(Number(amount)))],
      });
    }
  };

  const approve = async () => {
    if (!address || !vaultData || !collateralAsset) return;
    setPendingTxn(true);

    if (type === 'deposit') {
      approveWrite({
        abi: erc20ABI,
        address: collateralAsset,
        functionName: 'approve',
        args: [vaultData.address, amount],
      });
    } else {
      approveWrite({
        abi: vaultData.abi,
        address: vaultData.address,
        functionName: 'approve',
        args: [vaultData.address, amount],
      });
    }
  };

  const deposit = async () => {
    if (!address || !vaultData) return;
    setPendingTxn(true);
    depositWrite({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'deposit',
      args: [0, address],
    });
  };

  const redeem = async () => {
    if (!address || !vaultData) return;
    setPendingTxn(true);
    depositWrite({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'redeem',
      args: [address],
    });
  };

  return {
    allowance: (allowance || BigInt(0)) as bigint,
    createRequest,
    deposit,
    redeem,
    approve,
    pendingTxn,
    isDepositConfirmed: isConfirmed,
    isApproveConfirmed: approveSuccess,
  };
};
