import { useCallback } from 'react';
import type { Address } from 'viem';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import type { Abi } from 'abitype';
import PassiveLiquidityVault from '@/protocol/deployments/PassiveLiquidityVault.json';
import { useReadContracts, useAccount } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

// TODO: Update with actual deployed contract address
export const PARLAY_VAULT_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Address;

// Use ABI from deployments
const PARLAY_VAULT_ABI: Abi = (PassiveLiquidityVault as { abi: Abi }).abi;

export interface VaultData {
  totalAssets: bigint;
  totalSupply: bigint;
  utilizationRate: bigint;
  maxUtilizationRate: bigint;
  withdrawalDelay: bigint;
  emergencyMode: boolean;
  paused: boolean;
  manager: Address;
  asset: Address;
}

export interface UserVaultData {
  balance: bigint;
  pendingWithdrawal: bigint;
  withdrawalIndex: bigint;
}

export function usePassiveLiquidityVault() {
  const { address } = useAccount();
  const { toast } = useToast();

  // Read vault data
  const {
    data: vaultData,
    isLoading: isLoadingVaultData,
    refetch: refetchVaultData,
  } = useReadContracts({
    contracts: [
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'totalAssets',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'totalSupply',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'utilizationRate',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'maxUtilizationRate',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'withdrawalDelay',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'emergencyMode',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'paused',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'manager',
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: PARLAY_VAULT_ADDRESS,
        functionName: 'asset',
      },
    ],
    query: {
      enabled:
        !!PARLAY_VAULT_ADDRESS &&
        PARLAY_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000',
    },
  });

  // Read user data
  const {
    data: userData,
    isLoading: isLoadingUserData,
    refetch: refetchUserData,
  } = useReadContracts({
    contracts: address
      ? [
          {
            abi: PARLAY_VAULT_ABI,
            address: PARLAY_VAULT_ADDRESS,
            functionName: 'balanceOf',
            args: [address],
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: PARLAY_VAULT_ADDRESS,
            functionName: 'getPendingWithdrawal',
            args: [address],
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: PARLAY_VAULT_ADDRESS,
            functionName: 'userWithdrawalIndex',
            args: [address],
          },
        ]
      : [],
    query: {
      enabled:
        !!address &&
        !!PARLAY_VAULT_ADDRESS &&
        PARLAY_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000',
    },
  });

  // Read asset balance (USDe)
  const {
    data: assetBalance,
    isLoading: isLoadingAssetBalance,
    refetch: refetchAssetBalance,
  } = useReadContracts({
    contracts:
      address && vaultData?.[8]?.result
        ? [
            {
              abi: erc20Abi,
              address: vaultData[8].result as Address,
              functionName: 'balanceOf',
              args: [address],
            },
            {
              abi: erc20Abi,
              address: vaultData[8].result as Address,
              functionName: 'decimals',
            },
          ]
        : [],
    query: {
      enabled: !!address && !!vaultData?.[8]?.result,
    },
  });

  // Write contract hook
  const { writeContract: writeVaultContract, isPending: isVaultPending } =
    useSapienceWriteContract({
      onSuccess: () => {
        toast({
          title: 'Transaction successful',
          description: 'Your vault transaction has been processed.',
        });
        refetchVaultData();
        refetchUserData();
        refetchAssetBalance();
      },
      onError: (error) => {
        toast({
          title: 'Transaction failed',
          description: error.message,
          variant: 'destructive',
        });
      },
      successMessage: 'Vault transaction submission was successful',
      fallbackErrorMessage: 'Vault transaction failed',
    });

  // Parse vault data
  const parsedVaultData: VaultData | null = vaultData
    ? {
        totalAssets: (vaultData[0]?.result as bigint) || 0n,
        totalSupply: (vaultData[1]?.result as bigint) || 0n,
        utilizationRate: (vaultData[2]?.result as bigint) || 0n,
        maxUtilizationRate: (vaultData[3]?.result as bigint) || 0n,
        withdrawalDelay: (vaultData[4]?.result as bigint) || 0n,
        emergencyMode: (vaultData[5]?.result as boolean) || false,
        paused: (vaultData[6]?.result as boolean) || false,
        manager:
          (vaultData[7]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
        asset:
          (vaultData[8]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
      }
    : null;

  // Parse user data
  const parsedUserData: UserVaultData | null = userData
    ? {
        balance: (userData[0]?.result as bigint) || 0n,
        pendingWithdrawal: (userData[1]?.result as bigint) || 0n,
        withdrawalIndex: (userData[2]?.result as bigint) || 0n,
      }
    : null;

  // Get asset decimals
  const assetDecimals = (assetBalance?.[1]?.result as number) || 6;
  const userAssetBalance = (assetBalance?.[0]?.result as bigint) || 0n;

  // Deposit function
  const deposit = useCallback(
    async (amount: string, chainId: number) => {
      if (!parsedVaultData?.asset || !amount) return;

      const amountWei = parseUnits(amount, assetDecimals);

      // First approve the vault to spend tokens
      await writeVaultContract({
        chainId,
        address: parsedVaultData.asset,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PARLAY_VAULT_ADDRESS, amountWei],
      });

      // Then deposit
      await writeVaultContract({
        chainId,
        address: PARLAY_VAULT_ADDRESS,
        abi: PARLAY_VAULT_ABI,
        functionName: 'deposit',
        args: [amountWei, address!],
      });
    },
    [parsedVaultData?.asset, assetDecimals, writeVaultContract, address]
  );

  // Withdraw function (request withdrawal)
  const requestWithdrawal = useCallback(
    async (shares: string, chainId: number) => {
      if (!shares) return;

      const sharesWei = parseUnits(shares, assetDecimals);

      await writeVaultContract({
        chainId,
        address: PARLAY_VAULT_ADDRESS,
        abi: PARLAY_VAULT_ABI,
        functionName: 'requestWithdrawal',
        args: [sharesWei],
      });
    },
    [assetDecimals, writeVaultContract]
  );

  // Emergency withdraw function
  const emergencyWithdraw = useCallback(
    async (shares: string, chainId: number) => {
      if (!shares) return;

      const sharesWei = parseUnits(shares, assetDecimals);

      await writeVaultContract({
        chainId,
        address: PARLAY_VAULT_ADDRESS,
        abi: PARLAY_VAULT_ABI,
        functionName: 'emergencyWithdraw',
        args: [sharesWei],
      });
    },
    [assetDecimals, writeVaultContract]
  );

  // Process withdrawals function
  const processWithdrawals = useCallback(
    async (maxRequests: number, chainId: number) => {
      await writeVaultContract({
        chainId,
        address: PARLAY_VAULT_ADDRESS,
        abi: PARLAY_VAULT_ABI,
        functionName: 'processWithdrawals',
        args: [BigInt(maxRequests)],
      });
    },
    [writeVaultContract]
  );

  // Format functions
  const formatAssetAmount = useCallback(
    (amount: bigint) => {
      return formatUnits(amount, assetDecimals);
    },
    [assetDecimals]
  );

  const formatSharesAmount = useCallback(
    (amount: bigint) => {
      return formatUnits(amount, assetDecimals);
    },
    [assetDecimals]
  );

  const formatUtilizationRate = useCallback((rate: bigint) => {
    return ((Number(rate) / 10000) * 100).toFixed(1); // Convert from basis points to percentage
  }, []);

  const formatWithdrawalDelay = useCallback((delay: bigint) => {
    const days = Number(delay) / (24 * 60 * 60);
    return days >= 1
      ? `${days.toFixed(1)} days`
      : `${Number(delay) / 3600} hours`;
  }, []);

  return {
    // Data
    vaultData: parsedVaultData,
    userData: parsedUserData,
    userAssetBalance,
    assetDecimals,

    // Loading states
    isLoadingVaultData,
    isLoadingUserData,
    isLoadingAssetBalance,
    isVaultPending,

    // Actions
    deposit,
    requestWithdrawal,
    emergencyWithdraw,
    processWithdrawals,

    // Format functions
    formatAssetAmount,
    formatSharesAmount,
    formatUtilizationRate,
    formatWithdrawalDelay,

    // Refetch functions
    refetchVaultData,
    refetchUserData,
    refetchAssetBalance,
  };
}
