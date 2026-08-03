import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { erc20Abi, verifyMessage } from 'viem';
import type { Abi } from 'abitype';
import { predictionMarketVault } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import {
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
import { useReadContracts, useReadContract } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import { useVaultShareQuoteWs } from '~/hooks/ws/useVaultShareQuoteWs';

const DEFAULT_VAULT_ADDRESS = predictionMarketVault[DEFAULT_CHAIN_ID]?.address;
const VAULT_ABI: Abi = predictionMarketVaultAbi;

interface VaultData {
  availableAssets: bigint;
  totalSupply: bigint;
  totalLiquidValue: bigint;
  paused: boolean;
  manager: Address;
  asset: Address;
  depositInteractionDelay: bigint;
  expirationTime: bigint;
}

interface UsePassiveLiquidityVaultConfig {
  vaultAddress?: Address;
  chainId?: number;
}

export function usePassiveLiquidityVault(
  config?: UsePassiveLiquidityVaultConfig
) {
  const { currentAddress } = useCurrentAddress();

  const VAULT_ADDRESS: Address = config?.vaultAddress || DEFAULT_VAULT_ADDRESS;
  const TARGET_CHAIN_ID: number | undefined = config?.chainId;

  const {
    data: vaultData,
    isLoading: isLoadingVaultData,
    refetch: refetchVaultData,
  } = useReadContracts({
    // All-or-nothing: a failed sub-read must fail (and retry) the whole
    // query. With the default allowFailure: true, a single flaky RPC call
    // silently parses as 0 and renders a wrong vault balance.
    allowFailure: false,
    contracts: [
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'availableAssets',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'totalSupply',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'getTotalLiquidValue',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'paused',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'manager',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'asset',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'depositInteractionDelay',
        chainId: TARGET_CHAIN_ID,
      },
      {
        abi: VAULT_ABI,
        address: VAULT_ADDRESS,
        functionName: 'expirationTime',
        chainId: TARGET_CHAIN_ID,
      },
    ],
    query: {
      enabled: !!VAULT_ADDRESS,
    },
  });

  const {
    data: userData,
    isLoading: isLoadingUserData,
    refetch: refetchUserData,
  } = useReadContracts({
    allowFailure: false,
    contracts: currentAddress
      ? [
          {
            abi: VAULT_ABI,
            address: VAULT_ADDRESS,
            functionName: 'balanceOf',
            args: [currentAddress],
            chainId: TARGET_CHAIN_ID,
          },
        ]
      : [],
    query: {
      enabled: !!currentAddress && !!VAULT_ADDRESS,
    },
  });

  // Collateral token comes from the vault's own `asset()` (raw multicall index
  // 5), not the hardcoded registry — so balance/allowance reads work on any
  // chain, including a custom one where the SDK has no collateral entry.
  const assetAddress = vaultData?.[5] as Address | undefined;

  const { data: collateralBalance, refetch: refetchCollateralBalance } =
    useReadContract({
      abi: erc20Abi,
      address: assetAddress,
      functionName: 'balanceOf',
      args: currentAddress ? [currentAddress] : undefined,
      chainId: TARGET_CHAIN_ID,
      query: {
        enabled: !!currentAddress && !!assetAddress,
        refetchInterval: 5000,
      },
    });

  // Live collateral actually held by the vault contract. The TVL/progress bar
  // uses this for the in-vault (liquid) term instead of the periodically-indexed
  // value, so a deposit/cancel/withdrawal is reflected immediately. The
  // escrow-held terms (deployed + claimable) still come from the indexer since
  // they can't be read cheaply on-chain.
  const { data: vaultCollateralBalanceRaw, refetch: refetchVaultCollateral } =
    useReadContract({
      abi: erc20Abi,
      address: assetAddress,
      functionName: 'balanceOf',
      args: VAULT_ADDRESS ? [VAULT_ADDRESS] : undefined,
      chainId: TARGET_CHAIN_ID,
      query: {
        enabled: !!VAULT_ADDRESS && !!assetAddress,
        refetchInterval: 5000,
      },
    });
  const vaultCollateralBalance =
    typeof vaultCollateralBalanceRaw === 'bigint'
      ? vaultCollateralBalanceRaw
      : undefined;

  const { data: collateralAllowance, refetch: refetchCollateralAllowance } =
    useReadContract({
      abi: erc20Abi,
      address: assetAddress,
      functionName: 'allowance',
      args:
        currentAddress && VAULT_ADDRESS
          ? [currentAddress, VAULT_ADDRESS]
          : undefined,
      chainId: TARGET_CHAIN_ID,
      query: {
        enabled: !!currentAddress && !!VAULT_ADDRESS && !!assetAddress,
      },
    });

  const { data: pendingMapping, refetch: refetchPendingMapping } =
    useReadContracts({
      allowFailure: false,
      contracts: currentAddress
        ? [
            {
              abi: VAULT_ABI,
              address: VAULT_ADDRESS,
              functionName: 'pendingRequests',
              args: [currentAddress],
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
      query: {
        enabled: !!currentAddress && !!VAULT_ADDRESS,
      },
    });

  const { data: lastInteractionData, isPending: isLastInteractionPending } =
    useReadContracts({
      allowFailure: false,
      contracts: currentAddress
        ? [
            {
              abi: VAULT_ABI,
              address: VAULT_ADDRESS,
              functionName: 'lastUserInteractionTimestamp',
              args: [currentAddress],
              chainId: TARGET_CHAIN_ID,
            },
          ]
        : [],
      query: {
        enabled: !!currentAddress && !!VAULT_ADDRESS,
      },
    });

  const {
    writeContract: writeVaultContract,
    sendCalls,
    isPending: isVaultPending,
  } = useSapienceWriteContract({
    onSuccess: () => {
      refetchVaultData();
      refetchUserData();
      refetchCollateralBalance();
      refetchCollateralAllowance();
      refetchPendingMapping();
      refetchVaultCollateral();
    },
    successMessage: 'Vault transaction submission was successful',
    fallbackErrorMessage: 'Vault transaction failed',
  });

  const parsedVaultData: VaultData | null = vaultData
    ? {
        availableAssets: (vaultData[0] as bigint) || 0n,
        totalSupply: (vaultData[1] as bigint) || 0n,
        totalLiquidValue: (() => {
          const r = vaultData[2];
          if (Array.isArray(r)) return (r as bigint[])[0] ?? 0n;
          return (r as bigint) || 0n;
        })(),
        paused: (vaultData[3] as boolean) || false,
        manager:
          (vaultData[4] as Address) ||
          '0x0000000000000000000000000000000000000000',
        asset:
          (vaultData[5] as Address) ||
          '0x0000000000000000000000000000000000000000',
        depositInteractionDelay: (vaultData[6] as bigint) || 0n,
        expirationTime: (vaultData[7] as bigint) || 0n,
      }
    : null;

  const lastInteractionAt: bigint = (lastInteractionData?.[0] as bigint) || 0n;

  const interactionDelay: bigint =
    parsedVaultData?.depositInteractionDelay || 0n;

  const interactionDelayRemainingSec: number = useMemo(
    () => computeInteractionDelayRemaining(lastInteractionAt, interactionDelay),
    [lastInteractionAt, interactionDelay]
  );

  const isInteractionDelayActive =
    !isLastInteractionPending && interactionDelayRemainingSec > 0;

  const parsedUserData = userData
    ? { balance: (userData[0] as bigint) || 0n }
    : null;

  const assetDecimals = 18;

  const userAssetBalance =
    typeof collateralBalance === 'bigint' ? collateralBalance : 0n;

  const currentAllowance =
    typeof collateralAllowance === 'bigint' ? collateralAllowance : 0n;

  const pendingRequest = useMemo(
    () => parsePendingRequest(pendingMapping?.[0]),
    [pendingMapping]
  );

  const wsQuote = useVaultShareQuoteWs({
    chainId: TARGET_CHAIN_ID,
    vaultAddress: VAULT_ADDRESS,
  });
  const pricePerShareDecimal = wsQuote.vaultCollateralPerShare;

  const vaultManager: Address | undefined = parsedVaultData?.manager;
  const expirationTime: bigint = parsedVaultData?.expirationTime || 0n;

  const [quoteSignatureValid, setQuoteSignatureValid] = useState<
    boolean | undefined
  >(undefined);
  useEffect(() => {
    const raw = wsQuote.raw;
    if (!raw || !vaultManager || !raw.signature || !raw.signedBy) {
      setQuoteSignatureValid(undefined);
      return;
    }
    if (raw.signedBy.toLowerCase() !== vaultManager.toLowerCase()) {
      setQuoteSignatureValid(false);
      return;
    }
    const canonical = buildVaultQuoteMessage(raw);
    verifyMessage({
      address: raw.signedBy.toLowerCase() as `0x${string}`,
      message: canonical,
      signature: raw.signature as `0x${string}`,
    }).then(
      (ok) => setQuoteSignatureValid(!!ok),
      () => setQuoteSignatureValid(false)
    );
  }, [wsQuote.raw, vaultManager]);

  useEffect(() => {
    if (!pendingRequest || pendingRequest.processed) {
      return;
    }

    const interval = setInterval(() => {
      refetchPendingMapping?.();
      refetchUserData();
      refetchVaultData();
    }, 5000);

    return () => clearInterval(interval);
  }, [
    pendingRequest,
    refetchPendingMapping,
    refetchUserData,
    refetchVaultData,
  ]);

  const deposit = useCallback(
    async (amount: string, chainId: number) => {
      if (!parsedVaultData?.asset || !amount) return;

      const calls = buildDepositCalls({
        amount,
        assetAddress: parsedVaultData.asset,
        vaultAddress: VAULT_ADDRESS,
        vaultAbi: VAULT_ABI,
        pricePerShare: pricePerShareDecimal,
        currentAllowance,
        decimals: assetDecimals,
      });

      await sendCalls({ chainId, calls });
    },
    [
      parsedVaultData?.asset,
      pricePerShareDecimal,
      sendCalls,
      VAULT_ADDRESS,
      currentAllowance,
      assetDecimals,
    ]
  );

  const requestWithdrawal = useCallback(
    async (shares: string, chainId: number) => {
      if (!shares) return;

      const call = buildWithdrawalCall({
        shares,
        vaultAddress: VAULT_ADDRESS,
        vaultAbi: VAULT_ABI,
        pricePerShare: pricePerShareDecimal,
        decimals: assetDecimals,
      });

      await writeVaultContract({
        chainId,
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
      } as Parameters<typeof writeVaultContract>[0]);
    },
    [assetDecimals, pricePerShareDecimal, writeVaultContract, VAULT_ADDRESS]
  );

  const cancelDeposit = useCallback(
    async (chainId: number) => {
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'cancelDeposit',
        args: [],
      } as Parameters<typeof writeVaultContract>[0]);
    },
    [VAULT_ADDRESS, writeVaultContract]
  );

  const cancelWithdrawal = useCallback(
    async (chainId: number) => {
      await writeVaultContract({
        chainId,
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'cancelWithdrawal',
        args: [],
      } as Parameters<typeof writeVaultContract>[0]);
    },
    [VAULT_ADDRESS, writeVaultContract]
  );

  const formatAssetAmount = useCallback(
    (amount: bigint) => formatVaultAssetAmount(amount, assetDecimals),
    [assetDecimals]
  );

  const formatSharesAmount = useCallback(
    (amount: bigint) => formatVaultSharesAmount(amount, assetDecimals),
    [assetDecimals]
  );

  return {
    vaultData: parsedVaultData,
    userData: parsedUserData,
    pendingRequest,
    vaultCollateralBalance,
    userAssetBalance,
    assetDecimals,
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
    isLoadingVaultData,
    isLoadingUserData,
    isVaultPending,
    deposit,
    requestWithdrawal,
    cancelDeposit,
    cancelWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    formatUtilizationRate,
    formatInteractionDelay,
    refetchVaultData,
    refetchUserData,
    refetchCollateralBalance,
  };
}
