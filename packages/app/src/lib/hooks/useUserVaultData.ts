import { useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '~/lib/erc20abi.json';

type Props = {
  collateralAsset: `0x${string}`;
  vaultData: {
    abi: any;
    address: `0x${string}`;
  };
};

export const useUserVaultData = ({ collateralAsset, vaultData }: Props) => {
  const { address, isConnected, chainId } = useAccount();

  // Get user's collateral balance
  const { data: collateralBalance, refetch: refetchCollateralBalance } =
    useReadContract({
      abi: erc20ABI,
      address: collateralAsset,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
      chainId,
    });

  // Get claimable deposit request
  const { data: claimableDeposit, refetch: refetchClaimableDeposit } =
    useReadContract({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'claimableDepositRequest',
      args: [address as `0x${string}`],
      chainId,
      query: {
        enabled: isConnected,
      },
    });

  // Get claimable redeem request
  const { data: claimableRedeem, refetch: refetchClaimableRedeem } =
    useReadContract({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'claimableRedeemRequest',
      args: [address as `0x${string}`],
      chainId,
      query: {
        enabled: isConnected,
      },
    });

  // Get pending request
  const { data: pendingRequest, refetch: refetchPendingRequest } =
    useReadContract({
      abi: vaultData.abi,
      address: vaultData.address,
      functionName: 'pendingRequest',
      args: [address as `0x${string}`],
      chainId,
    });

  // Get user's vault share balance
  const { data: vaultShares, refetch: refetchVaultShares } = useReadContract({
    abi: erc20ABI,
    address: vaultData.address,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId,
    query: {
      enabled: isConnected,
    },
  });

  const refetchAll = useCallback(() => {
    refetchCollateralBalance();
    refetchPendingRequest();
    refetchClaimableDeposit();
    refetchClaimableRedeem();
    refetchVaultShares();
  }, [
    refetchCollateralBalance,
    refetchPendingRequest,
    refetchClaimableDeposit,
    refetchClaimableRedeem,
    refetchVaultShares,
  ]);

  return {
    isConnected,
    collateralBalance: (collateralBalance || BigInt(0)) as bigint,
    claimableDeposit: (claimableDeposit || BigInt(0)) as bigint,
    claimableRedeem: (claimableRedeem || BigInt(0)) as bigint,
    pendingRequest: (pendingRequest || null) as {
      amount: bigint;
      transactionType: number;
      requestInitiatedEpoch: bigint;
    } | null,
    vaultShares: (vaultShares || BigInt(0)) as bigint,
    refetchAll,
  };
};
