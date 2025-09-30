import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { erc20Abi, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import type { Abi } from 'abitype';
import PassiveLiquidityVault from '@/protocol/deployments/PassiveLiquidityVault.json';
import { useReadContracts, useAccount } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { verifyMessage } from 'viem';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useVaultShareQuote } from '~/hooks/data/useVaultShareQuote';
import { useVaultShareQuoteWs } from '~/hooks/data/useVaultShareQuoteWs';

// Default to deployment JSON address; can be overridden by hook config
const DEFAULT_VAULT_ADDRESS = (PassiveLiquidityVault as { address: Address })
  .address;

// Use ABI from deployments
const PARLAY_VAULT_ABI: Abi = (PassiveLiquidityVault as { abi: Abi }).abi;

export interface VaultData {
  totalAssets: bigint;
  totalSupply: bigint;
  utilizationRate: bigint;
  maxUtilizationRate: bigint;
  withdrawalDelay: bigint;
  paused: boolean;
  manager: Address;
  asset: Address;
}

export interface UserVaultData {
  balance: bigint;
  pendingWithdrawal: bigint;
  withdrawalIndex: bigint;
  pendingDeposit: bigint;
  depositIndex: bigint;
}

export interface DepositRequestDetails {
  user: Address;
  amount: bigint;
  timestamp: bigint;
  processed: boolean;
}

export interface WithdrawalRequestDetails {
  user: Address;
  shares: bigint;
  timestamp: bigint;
  processed: boolean;
}

export interface UsePassiveLiquidityVaultConfig {
  vaultAddress?: Address;
  chainId?: number;
}

export function usePassiveLiquidityVault(
  config?: UsePassiveLiquidityVaultConfig
) {
  const { address } = useAccount();
  const { toast } = useToast();

  const VAULT_ADDRESS: Address = config?.vaultAddress || DEFAULT_VAULT_ADDRESS;
  const TARGET_CHAIN_ID: number | undefined = config?.chainId;

  // Read vault data
  const {
    data: vaultData,
    isLoading: isLoadingVaultData,
    refetch: refetchVaultData,
  } = useReadContracts({
    contracts: [
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'totalAssets',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'totalSupply',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'utilizationRate',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'maxUtilizationRate',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'withdrawalDelay',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'paused',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'manager',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'asset',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PARLAY_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'MIN_DEPOSIT',
        chainId: TARGET_CHAIN_ID,
      },
    ],
    query: {
      enabled: !!VAULT_ADDRESS,
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
            address: VAULT_ADDRESS,
            functionName: 'balanceOf',
            args: [address],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'getPendingWithdrawal',
            args: [address],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'userWithdrawalIndex',
            args: [address],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'getPendingDeposit',
            args: [address],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PARLAY_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'userDepositIndex',
            args: [address],
            chainId: TARGET_CHAIN_ID,
          },
        ]
      : [],
    query: {
      enabled: !!address && !!VAULT_ADDRESS,
    },
  });

  // Read user's queue request details (timestamp, processed) when indices are present
  const userWithdrawalIdx = (userData?.[2]?.result as bigint) || 0n;
  const userDepositIdx = (userData?.[4]?.result as bigint) || 0n;

  const { data: userQueueDetails } = useReadContracts({
    contracts:
      userWithdrawalIdx > 0n || userDepositIdx > 0n
        ? [
            ...(userWithdrawalIdx > 0n
              ? [
                  {
                    abi: PARLAY_VAULT_ABI,
                    address: VAULT_ADDRESS,
                    functionName: 'getWithdrawalRequest',
                    args: [userWithdrawalIdx - 1n],
                    chainId: TARGET_CHAIN_ID,
                  } as const,
                ]
              : []),
            ...(userDepositIdx > 0n
              ? [
                  {
                    abi: PARLAY_VAULT_ABI,
                    address: VAULT_ADDRESS,
                    functionName: 'getDepositRequest',
                    args: [userDepositIdx - 1n],
                    chainId: TARGET_CHAIN_ID,
                  } as const,
                ]
              : []),
          ]
        : [],
    query: {
      enabled:
        !!VAULT_ADDRESS && (userWithdrawalIdx > 0n || userDepositIdx > 0n),
    },
  });

  // Read asset balance (USDe)
  const {
    data: assetBalance,
    isLoading: isLoadingAssetBalance,
    refetch: refetchAssetBalance,
  } = useReadContracts({
    contracts:
      address && vaultData?.[7]?.result
        ? [
            {
              abi: erc20Abi,
              address: vaultData[7].result as Address,
              functionName: 'balanceOf',
              args: [address],
              chainId: TARGET_CHAIN_ID,
            },
            {
              abi: erc20Abi,
              address: vaultData[7].result as Address,
              functionName: 'decimals',
              chainId: TARGET_CHAIN_ID,
            },
            {
              abi: erc20Abi,
              address: vaultData[7].result as Address,
              functionName: 'allowance',
              args: [address, VAULT_ADDRESS],
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
    query: {
      enabled: !!address && !!vaultData?.[7]?.result,
    },
  });

  // Write contract hook
  const {
    writeContract: writeVaultContract,
    sendCalls,
    isPending: isVaultPending,
  } = useSapienceWriteContract({
    onSuccess: () => {
      refetchVaultData();
      refetchUserData();
      refetchAssetBalance();
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
        paused: (vaultData[5]?.result as boolean) || false,
        manager:
          (vaultData[6]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
        asset:
          (vaultData[7]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
      }
    : null;

  // Parse user data
  const parsedUserData: UserVaultData | null = userData
    ? {
        balance: (userData[0]?.result as bigint) || 0n,
        pendingWithdrawal: (userData[1]?.result as bigint) || 0n,
        withdrawalIndex: (userData[2]?.result as bigint) || 0n,
        pendingDeposit: (userData[3]?.result as bigint) || 0n,
        depositIndex: (userData[4]?.result as bigint) || 0n,
      }
    : null;

  // Get asset decimals
  const assetDecimals = (assetBalance?.[1]?.result as number) || 6;
  const userAssetBalance = (assetBalance?.[0]?.result as bigint) || 0n;
  const currentAllowance = (assetBalance?.[2]?.result as bigint) || 0n;
  const minDeposit = (vaultData?.[8]?.result as bigint) || 0n; // MIN_DEPOSIT

  // Queue details parsing (preserve ordering: [withdrawal?, deposit?])
  const parsedWithdrawalRequest: WithdrawalRequestDetails | null =
    useMemo(() => {
      if (!userQueueDetails || userQueueDetails.length === 0) return null;
      const item = userWithdrawalIdx > 0n ? userQueueDetails[0] : undefined;
      if (!item?.result) return null;
      const r = item.result as unknown as {
        user: Address;
        shares: bigint;
        timestamp: bigint;
        processed: boolean;
      };
      return {
        user: r.user,
        shares: r.shares,
        timestamp: r.timestamp,
        processed: r.processed,
      };
    }, [userQueueDetails, userWithdrawalIdx]);

  const parsedDepositRequest: DepositRequestDetails | null = useMemo(() => {
    if (!userQueueDetails) return null;
    const hasWithdrawal = userWithdrawalIdx > 0n ? 1 : 0;
    const item =
      userDepositIdx > 0n ? userQueueDetails[hasWithdrawal] : undefined;
    if (!item?.result) return null;
    const r = item.result as unknown as {
      user: Address;
      amount: bigint;
      timestamp: bigint;
      processed: boolean;
    };
    return {
      user: r.user,
      amount: r.amount,
      timestamp: r.timestamp,
      processed: r.processed,
    };
  }, [userQueueDetails, userDepositIdx, userWithdrawalIdx]);

  // Price-per-share (on-chain fallback): scaled by 1e18
  const onChainPricePerShareRay = useMemo(() => {
    const totalAssetsWei = (vaultData?.[0]?.result as bigint) || 0n;
    const totalSupplyWei = (vaultData?.[1]?.result as bigint) || 0n;
    if (totalSupplyWei === 0n) return 10n ** 18n; // 1.0
    return (totalAssetsWei * 10n ** 18n) / totalSupplyWei;
  }, [vaultData]);

  // Prefer offchain quote if available
  // Prefer WS quotes first, then HTTP poll, then on-chain
  const httpQuote = useVaultShareQuote({
    chainId: TARGET_CHAIN_ID,
    vaultAddress: VAULT_ADDRESS,
    onChainFallbackRay: onChainPricePerShareRay,
  });
  const wsQuote = useVaultShareQuoteWs({
    chainId: TARGET_CHAIN_ID,
    vaultAddress: VAULT_ADDRESS,
    onChainFallbackRay: onChainPricePerShareRay,
  });
  const pricePerShareRay =
    wsQuote.source === 'ws'
      ? wsQuote.pricePerShareRay
      : httpQuote.pricePerShareRay;

  // Manager address (for signature validation)
  const vaultManager: Address | undefined = parsedVaultData?.manager;

  // Validate WS quote signature against owner (async)
  const [quoteSignatureValid, setQuoteSignatureValid] = useState<
    boolean | undefined
  >(undefined);
  useEffect(() => {
    const raw = wsQuote.raw;
    (async () => {
      if (!raw || !vaultManager || !raw.signature || !raw.signedBy) {
        setQuoteSignatureValid(undefined);
        return;
      }
      try {
        if (
          raw.signedBy.toLowerCase() !== (vaultManager as string).toLowerCase()
        ) {
          setQuoteSignatureValid(false);
          return;
        }
        const canonical = [
          'Sapience Vault Share Quote',
          `Vault: ${raw.vaultAddress.toLowerCase()}`,
          `ChainId: ${raw.chainId}`,
          `CollateralPerShare: ${String(raw.vaultCollateralPerShare)}`,
          `Timestamp: ${raw.timestamp}`,
        ].join('\n');
        const ok = await verifyMessage({
          address: raw.signedBy.toLowerCase() as `0x${string}`,
          message: canonical,
          signature: raw.signature as `0x${string}`,
        });
        setQuoteSignatureValid(!!ok);
      } catch {
        setQuoteSignatureValid(false);
      }
    })();
  }, [wsQuote.raw, vaultManager]);

  const hasFunction = useCallback((name: string, inputsLength?: number) => {
    try {
      const abiItems = (PassiveLiquidityVault as { abi: Abi })
        .abi as unknown as Array<any>;
      return abiItems.some(
        (f: any) =>
          f?.type === 'function' &&
          f?.name === name &&
          (inputsLength === undefined ||
            (Array.isArray(f?.inputs) && f.inputs.length === inputsLength))
      );
    } catch {
      return false;
    }
  }, []);

  // Deposit (enqueue) with optional minShares slippage protection when available
  const deposit = useCallback(
    async (amount: string, chainId: number) => {
      if (!parsedVaultData?.asset || !amount) return;

      const amountWei = parseUnits(amount, assetDecimals);

      // Compute minShares using the provided quote (no slippage)
      const estSharesWei =
        (amountWei * 10n ** 18n) /
        (pricePerShareRay === 0n ? 10n ** 18n : pricePerShareRay);
      const minSharesWei = estSharesWei;

      // Prepare calldata for requestDeposit (with or without min)
      const supportsRequestDepositWithMin =
        hasFunction('requestDeposit', 2) ||
        hasFunction('requestDepositWithMin', 2);
      const requestDepositAbi: Abi = supportsRequestDepositWithMin
        ? ([
            {
              type: 'function',
              name: hasFunction('requestDepositWithMin', 2)
                ? 'requestDepositWithMin'
                : 'requestDeposit',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'amount', type: 'uint256' },
                { name: 'minShares', type: 'uint256' },
              ],
              outputs: [{ name: 'queuePosition', type: 'uint256' }],
            },
          ] as unknown as Abi)
        : PARLAY_VAULT_ABI;

      const requestFunctionName = supportsRequestDepositWithMin
        ? hasFunction('requestDepositWithMin', 2)
          ? 'requestDepositWithMin'
          : 'requestDeposit'
        : 'requestDeposit';

      const requestDepositCalldata = encodeFunctionData({
        abi:
          requestFunctionName === 'requestDeposit' &&
          !supportsRequestDepositWithMin
            ? PARLAY_VAULT_ABI
            : requestDepositAbi,
        functionName: requestFunctionName as any,
        args: supportsRequestDepositWithMin
          ? [amountWei, minSharesWei]
          : [amountWei],
      });

      // If approval is required, batch approve + requestDeposit
      if (currentAllowance < amountWei) {
        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [VAULT_ADDRESS, amountWei],
        });
        await sendCalls({
          chainId,
          calls: [
            { to: parsedVaultData.asset, data: approveCalldata },
            { to: VAULT_ADDRESS, data: requestDepositCalldata },
          ],
        });
        return;
      }

      // Otherwise single call
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi:
          requestFunctionName === 'requestDeposit' &&
          !supportsRequestDepositWithMin
            ? PARLAY_VAULT_ABI
            : requestDepositAbi,
        functionName: requestFunctionName as any,
        args: supportsRequestDepositWithMin
          ? [amountWei, minSharesWei]
          : [amountWei],
      });
    },
    [
      parsedVaultData?.asset,
      assetDecimals,
      pricePerShareRay,
      hasFunction,
      writeVaultContract,
      sendCalls,
      address,
      currentAllowance,
      VAULT_ADDRESS,
    ]
  );

  // Withdraw function (enqueue) with optional minAssets slippage protection when available
  const requestWithdrawal = useCallback(
    async (shares: string, chainId: number) => {
      if (!shares) return;

      const sharesWei = parseUnits(shares, assetDecimals);

      // Compute minAssets using the provided quote (no slippage)
      const estAssetsWei =
        (sharesWei *
          (pricePerShareRay === 0n ? 10n ** 18n : pricePerShareRay)) /
        10n ** 18n;
      const minAssetsWei = estAssetsWei;

      const supportsWithdrawalWithMin =
        hasFunction('requestWithdrawal', 2) ||
        hasFunction('requestWithdrawalWithMin', 2);
      const withdrawalAbi: Abi = supportsWithdrawalWithMin
        ? ([
            {
              type: 'function',
              name: hasFunction('requestWithdrawalWithMin', 2)
                ? 'requestWithdrawalWithMin'
                : 'requestWithdrawal',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'shares', type: 'uint256' },
                { name: 'minAssets', type: 'uint256' },
              ],
              outputs: [{ name: 'queuePosition', type: 'uint256' }],
            },
          ] as unknown as Abi)
        : PARLAY_VAULT_ABI;

      const functionName = supportsWithdrawalWithMin
        ? hasFunction('requestWithdrawalWithMin', 2)
          ? 'requestWithdrawalWithMin'
          : 'requestWithdrawal'
        : 'requestWithdrawal';

      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi:
          functionName === 'requestWithdrawal' && !supportsWithdrawalWithMin
            ? PARLAY_VAULT_ABI
            : withdrawalAbi,
        functionName: functionName as any,
        args: supportsWithdrawalWithMin
          ? [sharesWei, minAssetsWei]
          : [sharesWei],
      });
    },
    [
      assetDecimals,
      pricePerShareRay,
      hasFunction,
      writeVaultContract,
      VAULT_ADDRESS,
    ]
  );

  // Process withdrawals function
  const processWithdrawals = useCallback(
    async (maxRequests: number, chainId: number) => {
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi: PARLAY_VAULT_ABI,
        functionName: 'processWithdrawals',
        args: [BigInt(maxRequests)],
      });
    },
    [writeVaultContract, VAULT_ADDRESS]
  );

  // Cancel functions (available after contract upgrade)
  const cancelDeposit = useCallback(
    async (chainId: number) => {
      const candidateNames = [
        'cancelDeposit',
        'cancelDepositRequest',
        'cancelPendingDeposit',
      ];
      const name = candidateNames.find((n) => hasFunction(n, 0));
      if (!name) {
        toast({
          title: 'Cancel not available',
          description: 'Contract upgrade required to cancel deposits.',
          variant: 'destructive',
        });
        return;
      }
      const abiFragment: Abi = [
        {
          type: 'function',
          name,
          stateMutability: 'nonpayable',
          inputs: [],
          outputs: [],
        },
      ] as unknown as Abi;
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi: abiFragment,
        functionName: name as any,
        args: [],
      });
    },
    [VAULT_ADDRESS, hasFunction, writeVaultContract, toast]
  );

  const cancelWithdrawal = useCallback(
    async (chainId: number) => {
      const candidateNames = [
        'cancelWithdrawal',
        'cancelWithdrawalRequest',
        'cancelPendingWithdrawal',
      ];
      const name = candidateNames.find((n) => hasFunction(n, 0));
      if (!name) {
        toast({
          title: 'Cancel not available',
          description: 'Contract upgrade required to cancel withdrawals.',
          variant: 'destructive',
        });
        return;
      }
      const abiFragment: Abi = [
        {
          type: 'function',
          name,
          stateMutability: 'nonpayable',
          inputs: [],
          outputs: [],
        },
      ] as unknown as Abi;
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi: abiFragment,
        functionName: name as any,
        args: [],
      });
    },
    [VAULT_ADDRESS, hasFunction, writeVaultContract, toast]
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

  const formatinteractionDelay = useCallback((delay: bigint) => {
    const days = Number(delay) / (24 * 60 * 60);
    return days >= 1
      ? `${days.toFixed(1)} days`
      : `${Number(delay) / 3600} hours`;
  }, []);

  return {
    // Data
    vaultData: parsedVaultData,
    userData: parsedUserData,
    depositRequest: parsedDepositRequest,
    withdrawalRequest: parsedWithdrawalRequest,
    userAssetBalance,
    assetDecimals,
    minDeposit,
    allowance: currentAllowance,
    pricePerShareRay,
    vaultManager,
    quoteSignatureValid,

    // Loading states
    isLoadingVaultData,
    isLoadingUserData,
    isLoadingAssetBalance,
    isVaultPending,

    // Actions
    deposit,
    requestWithdrawal,
    processWithdrawals,
    cancelDeposit,
    cancelWithdrawal,

    // Format functions
    formatAssetAmount,
    formatSharesAmount,
    formatUtilizationRate,
    formatinteractionDelay,

    // Refetch functions
    refetchVaultData,
    refetchUserData,
    refetchAssetBalance,
  };
}
