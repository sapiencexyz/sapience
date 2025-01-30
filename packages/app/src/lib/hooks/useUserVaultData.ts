import { useContext } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABI } from 'viem';
import { PeriodContext } from '~/lib/context/PeriodProvider';

export const useUserVaultData = () => {
  const { address, isConnected } = useAccount();

  console.log('address', address);
  console.log('isConnected', isConnected);

  const {
    address: marketAddress,
    chainId,
    collateralAsset,
    foilData,
  } = useContext(PeriodContext);

  // Get user's collateral balance
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
    chainId,
    // query: {
    //   enabled: isConnected,
    // },
  });
  console.log('collateralBalance', collateralBalance, collateralAsset, address);

  // Get market contract balance
  const { data: marketBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [marketAddress],
    chainId,
    query: {
      enabled: isConnected,
    },
  });
  console.log('marketBalance', marketBalance);

  // Get claimable deposit request
  const { data: claimableDeposit } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'claimableDepositRequest',
    args: [address as `0x${string}`],
    chainId,
    query: {
      enabled: isConnected,
    },
  });
  console.log('claimableDeposit', claimableDeposit);

  // Get pending request
  const { data: pendingRequest } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'pendingRequest',
    args: [address as `0x${string}`],
    chainId,
    query: {
      enabled: isConnected,
    },
  });

  console.log('pendingRequest', pendingRequest);

  return {
    isConnected,
    collateralBalance: collateralBalance || BigInt(0),
    marketBalance: marketBalance || BigInt(0),
    claimableDeposit: claimableDeposit || BigInt(0),
    pendingRequest: pendingRequest || null,
  };
};
