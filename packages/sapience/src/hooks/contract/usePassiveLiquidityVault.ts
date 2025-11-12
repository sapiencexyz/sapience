import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { passiveLiquidityVault } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { erc20Abi, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import type { Abi } from 'abitype';
import { liquidityVaultAbi } from '@sapience/sdk';
import { useReadContracts, useAccount } from 'wagmi';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { verifyMessage } from 'viem';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useVaultShareQuoteWs } from '~/hooks/data/useVaultShareQuoteWs';

// Default to address can be overridden by hook config
const DEFAULT_VAULT_ADDRESS = passiveLiquidityVault[DEFAULT_CHAIN_ID]?.address;

// Use ABI from SDK
const PARLAY_VAULT_ABI: Abi = liquidityVaultAbi;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// ABI helper: check if contract implements a function with optional arity
const hasFunction = (name: string, inputsLength?: number) => {
  try {
    const abiItems = liquidityVaultAbi as unknown as Array<any>;
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
};

export interface VaultData {
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

export interface PendingRequestDetails {
  user: Address;
  isDeposit: boolean;
  shares: bigint;
  assets: bigint;
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
        functionName: 'availableAssets',
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
        functionName: 'totalDeployed',
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
              abi: PARLAY_VAULT_ABI,
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
  const { data: interactionDelayData } = useReadContracts({
    contracts: hasFunction('interactionDelay', 0)
      ? [
          {
            abi: PARLAY_VAULT_ABI,
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

  const { data: lastInteractionData } = useReadContracts({
    contracts:
      address && hasFunction('lastUserInteractionTimestamp', 1)
        ? [
            {
              abi: PARLAY_VAULT_ABI,
              address: VAULT_ADDRESS,
              functionName: 'lastUserInteractionTimestamp',
              args: [address],
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
    query: {
      enabled:
        !!address &&
        !!VAULT_ADDRESS &&
        hasFunction('lastUserInteractionTimestamp', 1),
    },
  });

  const lastInteractionAt: bigint =
    (lastInteractionData?.[0]?.result as bigint) || 0n;

  const interactionDelayRemainingSec: number = useMemo(() => {
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const target = lastInteractionAt + interactionDelay;
      const remaining =
        target > BigInt(nowSec) ? Number(target - BigInt(nowSec)) : 0;
      return remaining > 0 ? remaining : 0;
    } catch {
      return 0;
    }
  }, [lastInteractionAt, interactionDelay]);

  const isInteractionDelayActive = interactionDelayRemainingSec > 0;

  const { data: pendingMapping, refetch: refetchPendingMapping } =
    useReadContracts({
      contracts:
        address && hasFunction('pendingRequests', 1)
          ? [
              {
                abi: PARLAY_VAULT_ABI,
                address: VAULT_ADDRESS,
                functionName: 'pendingRequests',
                args: [address],
                chainId: TARGET_CHAIN_ID,
              },
            ]
          : [],
      query: {
        enabled:
          !!address && !!VAULT_ADDRESS && hasFunction('pendingRequests', 1),
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

  // Get asset decimals (default to 18 while loading to avoid UI flash)
  const assetDecimals = (assetBalance?.[1]?.result as number) || 18;
  const userAssetBalance = (assetBalance?.[0]?.result as bigint) || 0n;
  const currentAllowance = (assetBalance?.[2]?.result as bigint) || 0n;
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

  const pendingRequest: PendingRequestDetails | null = useMemo(() => {
    try {
      const raw = pendingMapping?.[0]?.result as any;
      if (!raw) return null;
      // Support both named tuple object and array tuple
      if (Array.isArray(raw)) {
        const [user, isDeposit, shares, assets, timestamp, processed] = raw as [
          Address,
          boolean,
          bigint,
          bigint,
          bigint,
          boolean,
        ];
        if (
          !user ||
          (user as string).toLowerCase() === ZERO_ADDRESS.toLowerCase()
        )
          return null;
        return { user, isDeposit, shares, assets, timestamp, processed };
      }
      const candidate = {
        user: raw.user as Address,
        isDeposit: Boolean(raw.isDeposit),
        shares: BigInt(raw.shares ?? 0n),
        assets: BigInt(raw.assets ?? 0n),
        timestamp: BigInt(raw.timestamp ?? 0n),
        processed: Boolean(raw.processed),
      } as PendingRequestDetails;
      if (
        !candidate.user ||
        (candidate.user as string).toLowerCase() === ZERO_ADDRESS.toLowerCase()
      )
        return null;
      return candidate;
    } catch {
      return null;
    }
  }, [pendingMapping]);

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

      const amountWei = parseUnits(amount, assetDecimals);

      // Compute minShares using the provided decimal quote (no slippage)
      const ppsScaled = parseUnits(
        pricePerShareDecimal && pricePerShareDecimal !== '0'
          ? pricePerShareDecimal
          : '1',
        assetDecimals
      );
      const estSharesWei =
        ppsScaled === 0n
          ? 0n
          : (amountWei * 10n ** BigInt(assetDecimals)) / ppsScaled;
      const minSharesWei = estSharesWei;

      // Prepare calldata for requestDeposit (with or without min)
      const supportsRequestDepositWithMin =
        hasFunctionCb('requestDeposit', 2) ||
        hasFunctionCb('requestDepositWithMin', 2);
      const requestDepositAbi: Abi = supportsRequestDepositWithMin
        ? ([
            {
              type: 'function',
              name: hasFunctionCb('requestDepositWithMin', 2)
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
        ? hasFunctionCb('requestDepositWithMin', 2)
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
      pricePerShareDecimal,
      hasFunctionCb,
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

      // Compute minAssets using the provided decimal quote (no slippage)
      const ppsScaled = parseUnits(
        pricePerShareDecimal && pricePerShareDecimal !== '0'
          ? pricePerShareDecimal
          : '1',
        assetDecimals
      );
      const estAssetsWei =
        (sharesWei * ppsScaled) / 10n ** BigInt(assetDecimals);
      const minAssetsWei = estAssetsWei;

      const supportsWithdrawalWithMin =
        hasFunctionCb('requestWithdrawal', 2) ||
        hasFunctionCb('requestWithdrawalWithMin', 2);
      const withdrawalAbi: Abi = supportsWithdrawalWithMin
        ? ([
            {
              type: 'function',
              name: hasFunctionCb('requestWithdrawalWithMin', 2)
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
        ? hasFunctionCb('requestWithdrawalWithMin', 2)
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
