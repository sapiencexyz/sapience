import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { erc20Abi } from 'viem';
import { passiveLiquidityVault } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';
import type { Abi } from 'abitype';
import {
  liquidityVaultAbi,
  abiHasFunction,
  formatVaultAssetAmount,
  formatVaultSharesAmount,
  formatUtilizationRate,
  formatInteractionDelay,
  buildDepositCalls,
  buildWithdrawalCall,
  parsePendingRequest,
  computeInteractionDelayRemaining,
  buildVaultQuoteMessage,
} from '@sapience/sdk';
import { useReadContracts, useBalance, useReadContract } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { verifyMessage } from 'viem';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import { useVaultShareQuoteWs } from '~/hooks/data/useVaultShareQuoteWs';

// Default to address can be overridden by hook config
const DEFAULT_VAULT_ADDRESS = passiveLiquidityVault[DEFAULT_CHAIN_ID]?.address;

// Use ABI from SDK
const PASSIVE_VAULT_ABI: Abi = liquidityVaultAbi;
// ABI helper: uses SDK's abiHasFunction
const hasFunction = (name: string, inputsLength?: number) =>
  abiHasFunction(liquidityVaultAbi as unknown as readonly unknown[], name, inputsLength);

interface VaultData {
  availableAssets: bigint;
  totalSupply: bigint;
  totalDeployed: bigint;
  utilizationRate: bigint;
  maxUtilizationRate: bigint;
  withdrawalDelay: bigint;
  paused: boolean;
  manager: Address;
  asset: Address;
}

interface UserVaultData {
  balance: bigint;
  pendingWithdrawal: bigint;
  withdrawalIndex: bigint;
  pendingDeposit: bigint;
  depositIndex: bigint;
}

interface DepositRequestDetails {
  user: Address;
  amount: bigint;
  timestamp: bigint;
  processed: boolean;
}

interface WithdrawalRequestDetails {
  user: Address;
  shares: bigint;
  timestamp: bigint;
  processed: boolean;
}

interface PendingRequestDetails {
  user: Address;
  isDeposit: boolean;
  shares: bigint;
  assets: bigint;
  timestamp: bigint;
  processed: boolean;
}

interface UsePassiveLiquidityVaultConfig {
  vaultAddress?: Address;
  chainId?: number;
}

export function usePassiveLiquidityVault(
  config?: UsePassiveLiquidityVaultConfig
) {
  const { currentAddress, isCalculating: isCalculatingAddress } =
    useCurrentAddress();
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
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'availableAssets',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'totalSupply',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'totalDeployed',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'utilizationRate',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'maxUtilizationRate',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'withdrawalDelay',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'paused',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'manager',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'asset',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: PASSIVE_VAULT_ABI,
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
    contracts: currentAddress
      ? [
          {
            abi: PASSIVE_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'balanceOf',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PASSIVE_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'getPendingWithdrawal',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PASSIVE_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'userWithdrawalIndex',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PASSIVE_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'getPendingDeposit',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
          {
            abi: PASSIVE_VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'userDepositIndex',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
        ]
      : [],
    query: {
      enabled: !!currentAddress && !!VAULT_ADDRESS,
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
                    abi: PASSIVE_VAULT_ABI,
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
                    abi: PASSIVE_VAULT_ABI,
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

  // Native balance (vault is always on Ethereal, uses native USDe)
  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: currentAddress,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!currentAddress },
  });

  // wUSDe balance (for combined balance display)
  const { data: wusdeBalance, refetch: refetchWusdeBalance } = useReadContract({
    abi: erc20Abi,
    address: collateralToken[DEFAULT_CHAIN_ID]?.address,
    functionName: 'balanceOf',
    args: currentAddress ? [currentAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: !!currentAddress,
      refetchInterval: 5000,
    },
  });

  // wUSDe allowance to vault (to skip approve call when sufficient)
  const { data: wusdeAllowance, refetch: refetchWusdeAllowance } =
    useReadContract({
      abi: erc20Abi,
      address: collateralToken[DEFAULT_CHAIN_ID]?.address,
      functionName: 'allowance',
      args:
        currentAddress && VAULT_ADDRESS
          ? [currentAddress, VAULT_ADDRESS]
          : undefined,
      chainId: TARGET_CHAIN_ID,
      query: {
        enabled: !!currentAddress && !!VAULT_ADDRESS,
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
      refetchNativeBalance();
      refetchWusdeBalance();
      refetchWusdeAllowance();
      try {
        refetchPendingMapping?.();
      } catch {
        void 0;
      }
      try {
        refetchExtraVaultFields?.();
      } catch {
        void 0;
      }
    },
    successMessage: 'Vault transaction submission was successful',
    fallbackErrorMessage: 'Vault transaction failed',
  });

  // Parse vault data
  const parsedVaultData: VaultData | null = vaultData
    ? {
        availableAssets: (vaultData[0]?.result as bigint) || 0n,
        totalSupply: (vaultData[1]?.result as bigint) || 0n,
        totalDeployed: (vaultData[2]?.result as bigint) || 0n,
        utilizationRate: (vaultData[3]?.result as bigint) || 0n,
        maxUtilizationRate: (vaultData[4]?.result as bigint) || 0n,
        withdrawalDelay: (vaultData[5]?.result as bigint) || 0n,
        paused: (vaultData[6]?.result as boolean) || false,
        manager:
          (vaultData[7]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
        asset:
          (vaultData[8]?.result as Address) ||
          '0x0000000000000000000000000000000000000000',
      }
    : null;

  // Optional reads: expirationTime and pendingRequests mapping (feature-detected)
  const { data: extraVaultFields, refetch: refetchExtraVaultFields } =
    useReadContracts({
      contracts: hasFunction('expirationTime', 0)
        ? [
            {
              abi: PASSIVE_VAULT_ABI,
              address: VAULT_ADDRESS,
              functionName: 'expirationTime',
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
      query: {
        enabled: !!VAULT_ADDRESS && hasFunction('expirationTime', 0),
      },
    });

  const expirationTime: bigint =
    (extraVaultFields?.[0]?.result as bigint) || 0n;

  // Interaction delay and last interaction timestamp
  const { data: interactionDelayData, isPending: isInteractionDelayPending } =
    useReadContracts({
      contracts: hasFunction('interactionDelay', 0)
        ? [
            {
              abi: PASSIVE_VAULT_ABI,
              address: VAULT_ADDRESS,
              functionName: 'interactionDelay',
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
      query: {
        enabled: !!VAULT_ADDRESS && hasFunction('interactionDelay', 0),
      },
    });

  const interactionDelay: bigint =
    (interactionDelayData?.[0]?.result as bigint) || 0n;

  // Use currentAddress for cooldown check - this is the smart account address when using AA,
  // or the EOA address when using direct wallet mode. The vault tracks cooldowns against
  // the address that actually submits transactions.
  const { data: lastInteractionData, isPending: isLastInteractionPending } =
    useReadContracts({
      contracts:
        currentAddress && hasFunction('lastUserInteractionTimestamp', 1)
          ? [
              {
                abi: PASSIVE_VAULT_ABI,
                address: VAULT_ADDRESS,
                functionName: 'lastUserInteractionTimestamp',
                args: [currentAddress],
                chainId: TARGET_CHAIN_ID,
              },
            ]
          : [],
      query: {
        enabled:
          !!currentAddress &&
          !!VAULT_ADDRESS &&
          hasFunction('lastUserInteractionTimestamp', 1),
      },
    });

  const lastInteractionAt: bigint =
    (lastInteractionData?.[0]?.result as bigint) || 0n;

  const interactionDelayRemainingSec: number = useMemo(
    () => computeInteractionDelayRemaining(lastInteractionAt, interactionDelay),
    [lastInteractionAt, interactionDelay]
  );

  // Only consider cooldown active if address has stabilized and queries have loaded
  const isInteractionDelayActive =
    !isCalculatingAddress &&
    !isInteractionDelayPending &&
    !isLastInteractionPending &&
    interactionDelayRemainingSec > 0;

  const { data: pendingMapping, refetch: refetchPendingMapping } =
    useReadContracts({
      contracts:
        currentAddress && hasFunction('pendingRequests', 1)
          ? [
              {
                abi: PASSIVE_VAULT_ABI,
                address: VAULT_ADDRESS,
                functionName: 'pendingRequests',
                args: [currentAddress],
                chainId: TARGET_CHAIN_ID,
              },
            ]
          : [],
      query: {
        enabled:
          !!currentAddress &&
          !!VAULT_ADDRESS &&
          hasFunction('pendingRequests', 1),
      },
    });

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

  // Native USDe always has 18 decimals
  const assetDecimals = 18;

  // User's combined USDe balance (native + wrapped)
  const nativeUsdeBalance = nativeBalance?.value || 0n;
  const wrappedUsdeBalance =
    typeof wusdeBalance === 'bigint' ? wusdeBalance : 0n;
  const userAssetBalance = nativeUsdeBalance + wrappedUsdeBalance;

  // wUSDe allowance to vault (used to skip redundant approve calls)
  const currentAllowance =
    typeof wusdeAllowance === 'bigint' ? wusdeAllowance : 0n;

  const minDeposit = (vaultData?.[9]?.result as bigint) || 0n; // MIN_DEPOSIT

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

  const pendingRequest: PendingRequestDetails | null = useMemo(
    () => parsePendingRequest(pendingMapping?.[0]?.result) as PendingRequestDetails | null,
    [pendingMapping]
  );

  const wsQuote = useVaultShareQuoteWs({
    chainId: TARGET_CHAIN_ID,
    vaultAddress: VAULT_ADDRESS,
  });
  const pricePerShareDecimal = wsQuote.vaultCollateralPerShare;

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
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultHook] signature: skipped', {
            hasRaw: !!raw,
            hasManager: !!vaultManager,
            hasSig: !!raw?.signature,
            hasSigner: !!raw?.signedBy,
          });
        }
        return;
      }
      try {
        if (
          raw.signedBy.toLowerCase() !== (vaultManager as string).toLowerCase()
        ) {
          setQuoteSignatureValid(false);
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[VaultHook] signature: wrong signer', {
              signedBy: raw.signedBy,
              expected: String(vaultManager),
            });
          }
          return;
        }
        const canonical = buildVaultQuoteMessage(raw);
        const ok = await verifyMessage({
          address: raw.signedBy.toLowerCase() as `0x${string}`,
          message: canonical,
          signature: raw.signature as `0x${string}`,
        });
        setQuoteSignatureValid(!!ok);
      } catch {
        setQuoteSignatureValid(false);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VaultHook] signature: verify error');
        }
      }
    })();
  }, [wsQuote.raw, vaultManager]);

  // Poll pending request status every 5 seconds when there's an active pending request
  useEffect(() => {
    if (!pendingRequest || pendingRequest.processed) {
      return;
    }

    const interval = setInterval(() => {
      refetchPendingMapping?.();
      refetchUserData();
      refetchVaultData();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [
    pendingRequest,
    refetchPendingMapping,
    refetchUserData,
    refetchVaultData,
  ]);

  const hasFunctionCb = useCallback(hasFunction, []);

  // Deposit (enqueue) with optional minShares slippage protection when available
  const deposit = useCallback(
    async (amount: string, chainId: number) => {
      if (!parsedVaultData?.asset || !amount) return;

      const calls = buildDepositCalls(
        {
          amount,
          assetAddress: parsedVaultData.asset,
          vaultAddress: VAULT_ADDRESS,
          vaultAbi: PASSIVE_VAULT_ABI,
          pricePerShare: pricePerShareDecimal,
          wrappedBalance: wrappedUsdeBalance,
          currentAllowance,
          decimals: assetDecimals,
        },
        hasFunctionCb
      );

      await sendCalls({ chainId, calls });
    },
    [
      parsedVaultData?.asset,
      pricePerShareDecimal,
      hasFunctionCb,
      sendCalls,
      VAULT_ADDRESS,
      wrappedUsdeBalance,
      currentAllowance,
      assetDecimals,
    ]
  );

  // Withdraw function (enqueue) with optional minAssets slippage protection when available
  const requestWithdrawal = useCallback(
    async (shares: string, chainId: number) => {
      if (!shares) return;

      const call = buildWithdrawalCall(
        {
          shares,
          vaultAddress: VAULT_ADDRESS,
          vaultAbi: PASSIVE_VAULT_ABI,
          pricePerShare: pricePerShareDecimal,
          decimals: assetDecimals,
        },
        hasFunctionCb
      );

      await writeVaultContract({
        chainId,
        address: call.address,
        abi: call.abi,
        functionName: call.functionName as any,
        args: call.args as any,
      });
    },
    [
      assetDecimals,
      pricePerShareDecimal,
      hasFunctionCb,
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
        abi: PASSIVE_VAULT_ABI,
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
      const name = candidateNames.find((n) => hasFunctionCb(n, 0));
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
    [VAULT_ADDRESS, hasFunctionCb, writeVaultContract, toast]
  );

  const cancelWithdrawal = useCallback(
    async (chainId: number) => {
      const candidateNames = [
        'cancelWithdrawal',
        'cancelWithdrawalRequest',
        'cancelPendingWithdrawal',
      ];
      const name = candidateNames.find((n) => hasFunctionCb(n, 0));
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
    [VAULT_ADDRESS, hasFunctionCb, writeVaultContract, toast]
  );

  // Format functions — thin wrappers around SDK utilities
  const formatAssetAmount = useCallback(
    (amount: bigint) => formatVaultAssetAmount(amount, assetDecimals),
    [assetDecimals]
  );

  const formatSharesAmount = useCallback(
    (amount: bigint) => formatVaultSharesAmount(amount, assetDecimals),
    [assetDecimals]
  );

  const formatinteractionDelay = useCallback(
    (delay: bigint) => formatInteractionDelay(delay),
    []
  );

  return {
    // Data
    vaultData: parsedVaultData,
    userData: parsedUserData,
    depositRequest: parsedDepositRequest,
    withdrawalRequest: parsedWithdrawalRequest,
    pendingRequest,
    userAssetBalance,
    assetDecimals,
    minDeposit,
    allowance: currentAllowance,
    pricePerShare: pricePerShareDecimal,
    vaultManager,
    quoteSignatureValid,
    expirationTime,
    interactionDelay,
    lastInteractionAt,
    interactionDelayRemainingSec,
    isInteractionDelayActive,
    accountAddress: currentAddress,

    // Loading states
    isLoadingVaultData,
    isLoadingUserData,
    isCalculatingAddress,
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
    refetchNativeBalance,
    refetchWusdeBalance,

    // Individual balance components (for UI transparency)
    nativeUsdeBalance,
    wrappedUsdeBalance,
  };
}
