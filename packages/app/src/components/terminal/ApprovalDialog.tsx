'use client';

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  useReadContract,
  useReadContracts,
  useBalance,
  useAccount,
  useSendCalls,
} from 'wagmi';
import {
  formatUnits,
  parseUnits,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
} from 'viem';
import { predictionMarket } from '@sapience/sdk/contracts';
import { predictionMarketAbi } from '@sapience/sdk';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import erc20AbiLocal from '@sapience/sdk/queries/abis/erc20abi.json';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Input } from '@sapience/ui/components/ui/input';
import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from './ApprovalDialogContext';

const GAS_RESERVE = 0.5;

// wUSDe configuration for Ethereal chain
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ApprovalDialog: React.FC = () => {
  const { isOpen, setOpen, requiredAmount } = useApprovalDialog();
  const chainId = useChainIdFromLocalStorage();
  const { address } = useAccount();
  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();
  const { toast } = useToast();

  const isEtherealChain =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;

  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Read collateral token address from PredictionMarket contract config
  const predictionMarketConfigRead = useReadContracts({
    contracts: SPENDER_ADDRESS
      ? [
          {
            address: SPENDER_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!SPENDER_ADDRESS },
  });

  const COLLATERAL_ADDRESS: `0x${string}` | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { collateralToken: `0x${string}` };
      return cfg?.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  // Simplification: on Ethereal, trading collateral is always wUSDe (and native USDe is used for gas + wrapping).
  const collateralAddress = useMemo(() => {
    return isEtherealChain ? WUSDE_ADDRESS : COLLATERAL_ADDRESS;
  }, [isEtherealChain, COLLATERAL_ADDRESS]);

  const { data: decimals } = useReadContract({
    abi: erc20AbiLocal,
    address: collateralAddress,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(collateralAddress) },
  });

  // Read native USDe balance (for Ethereal chain)
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) && isEtherealChain },
  });

  // Read wUSDe balance (for Ethereal chain)
  const { data: wusdeBalance, refetch: refetchWusde } = useReadContract({
    abi: erc20Abi,
    address: WUSDE_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address) && isEtherealChain },
  });

  // Read ERC20 collateral balance (for non-Ethereal chains)
  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    abi: erc20Abi,
    address: collateralAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: Boolean(address && collateralAddress) && !isEtherealChain,
    },
  });

  const [approveAmount, setApproveAmount] = useState<string>('');
  const [isWaitingForAllowance, setIsWaitingForAllowance] = useState(false);
  const allowanceWaitIdRef = useRef(0);

  useEffect(() => {
    if (
      requiredAmount &&
      (!approveAmount || Number(approveAmount) < Number(requiredAmount))
    ) {
      setApproveAmount(requiredAmount);
    }
  }, [requiredAmount]);

  const tokenDecimals = useMemo(() => {
    try {
      return typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
    } catch {
      return 18;
    }
  }, [decimals]);

  const gasReserveWei = useMemo(() => {
    try {
      return parseUnits(String(GAS_RESERVE), tokenDecimals);
    } catch {
      // Fallback: treat reserve as 0 if decimals aren't ready yet
      return 0n;
    }
  }, [tokenDecimals]);

  const approveAmountWei = useMemo(() => {
    try {
      if (!approveAmount) return 0n;
      return parseUnits(approveAmount, tokenDecimals);
    } catch {
      return 0n;
    }
  }, [approveAmount, tokenDecimals]);

  const requiredAmountWei = useMemo(() => {
    try {
      if (!requiredAmount) return null;
      return parseUnits(requiredAmount, tokenDecimals);
    } catch {
      return null;
    }
  }, [requiredAmount, tokenDecimals]);

  const nativeWei = useMemo(() => {
    // useBalance returns { value: bigint, formatted: string }
    return nativeBalance?.value ?? 0n;
  }, [nativeBalance?.value]);

  const wusdeWei = useMemo(() => {
    return wusdeBalance ?? 0n;
  }, [wusdeBalance]);

  const erc20Wei = useMemo(() => {
    return erc20Balance ?? 0n;
  }, [erc20Balance]);

  const effectiveBalanceWei = useMemo(() => {
    const totalWei = isEtherealChain ? nativeWei + wusdeWei : erc20Wei;
    if (totalWei <= gasReserveWei) return 0n;
    return totalWei - gasReserveWei;
  }, [isEtherealChain, nativeWei, wusdeWei, erc20Wei, gasReserveWei]);

  const effectiveBalanceDisplay = useMemo(() => {
    try {
      const human = Number(formatUnits(effectiveBalanceWei, tokenDecimals));
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [effectiveBalanceWei, tokenDecimals]);

  const {
    allowance,
    isLoadingAllowance,
    approve,
    isApproving,
    refetchAllowance,
  } = useTokenApproval({
    tokenAddress: collateralAddress,
    spenderAddress: SPENDER_ADDRESS,
    amount: approveAmount,
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(collateralAddress && SPENDER_ADDRESS),
  });

  const allowanceDisplay = useMemo(() => {
    try {
      if (allowance == null) return '0';
      const human = Number(
        formatUnits(allowance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [allowance, tokenDecimals]);

  // Calculate how much wrapping is needed (USDe -> wUSDe) for Ethereal chains.
  // Important: do all math in wei to avoid floating-point rounding issues.
  const { needsWrapping, wrapAmount, canFullyWrap } = useMemo(() => {
    if (!isEtherealChain) {
      return { needsWrapping: false, wrapAmount: 0n, canFullyWrap: true };
    }

    if (approveAmountWei <= 0n) {
      return { needsWrapping: false, wrapAmount: 0n, canFullyWrap: true };
    }

    const neededWrapWei =
      approveAmountWei > wusdeWei ? approveAmountWei - wusdeWei : 0n;
    if (neededWrapWei <= 0n) {
      return { needsWrapping: false, wrapAmount: 0n, canFullyWrap: true };
    }

    // Leave a gas reserve in native USDe.
    const availableNativeWei =
      nativeWei > gasReserveWei ? nativeWei - gasReserveWei : 0n;
    const ok = availableNativeWei >= neededWrapWei;

    return {
      needsWrapping: true,
      // Wrap the full missing amount so we end up with wUSDe >= approveAmountWei before approval
      wrapAmount: neededWrapWei,
      canFullyWrap: ok,
    };
  }, [isEtherealChain, approveAmountWei, wusdeWei, nativeWei, gasReserveWei]);

  // useSendCalls for batching wrap + approve
  const { sendCallsAsync, isPending: isSendingCalls } = useSendCalls();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cancel any outstanding allowance wait when dialog closes
  useEffect(() => {
    if (!isOpen) {
      allowanceWaitIdRef.current += 1;
      setIsWaitingForAllowance(false);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!collateralAddress || !SPENDER_ADDRESS || !approveAmount) {
      console.error('Missing required parameters:', {
        COLLATERAL_ADDRESS: collateralAddress,
        SPENDER_ADDRESS,
        approveAmount,
      });
      toast({
        title: 'Configuration Error',
        description:
          'Unable to submit approval. Please try refreshing the page.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      if (approveAmountWei <= 0n) {
        throw new Error('Invalid approval amount');
      }
      const waitId = ++allowanceWaitIdRef.current;

      if (isEtherealChain && needsWrapping) {
        if (!canFullyWrap) {
          throw new Error(
            'Insufficient native USDe to wrap into wUSDe (after gas reserve)'
          );
        }
      }

      if (isEtherealChain && needsWrapping && wrapAmount > 0n) {
        // Batch: wrap USDe to wUSDe, then approve
        const wrapCalldata = encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        });

        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [SPENDER_ADDRESS, approveAmountWei],
        });

        await sendCallsAsync({
          chainId,
          calls: [
            {
              to: WUSDE_ADDRESS,
              data: wrapCalldata,
              value: wrapAmount,
            },
            {
              to: collateralAddress,
              data: approveCalldata,
              value: 0n,
            },
          ],
          // Enable fallback for wallets that don't support EIP-5792
          experimental_fallback: true,
        } as any);
      } else {
        // Just approve
        await approve();
      }

      // Wait/poll until allowance reflects the new approval amount, then close.
      // This prevents the dialog from closing before the UI can observe the updated allowance.
      setIsWaitingForAllowance(true);
      void (async () => {
        try {
          const timeoutMs = 45_000;
          const intervalMs = 1_500;
          const startedAt = Date.now();

          while (Date.now() - startedAt < timeoutMs) {
            if (allowanceWaitIdRef.current !== waitId) return; // cancelled/replaced

            const result = await refetchAllowance();
            const latest = (result?.data ?? allowance) as unknown as
              | bigint
              | undefined;

            if (latest != null && latest >= approveAmountWei) {
              // Best-effort: refresh balances once the allowance is updated
              if (isEtherealChain) {
                refetchNative();
                refetchWusde();
              } else {
                refetchErc20();
              }

              setIsWaitingForAllowance(false);
              setOpen(false);
              return;
            }

            await sleep(intervalMs);
          }

          if (allowanceWaitIdRef.current !== waitId) return; // cancelled/replaced

          setIsWaitingForAllowance(false);
          toast({
            title: 'Approval submitted',
            description:
              'Waiting for the updated allowance took longer than expected. Please wait a moment and try again if needed.',
            duration: 6000,
          });
        } catch (e) {
          if (allowanceWaitIdRef.current !== waitId) return; // cancelled/replaced
          setIsWaitingForAllowance(false);
          toast({
            title: 'Approval submitted',
            description:
              'We could not confirm the updated allowance yet. Please wait a moment and try again if needed.',
            duration: 6000,
          });
          console.error('Failed while waiting for allowance update:', e);
        }
      })();
    } catch (error) {
      // Show error to user - approve() logs but doesn't toast
      console.error('Approval failed:', error);
      toast({
        title: 'Approval Failed',
        description:
          error instanceof Error ? error.message : 'Failed to submit approval',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    collateralAddress,
    SPENDER_ADDRESS,
    approveAmount,
    tokenDecimals,
    isEtherealChain,
    needsWrapping,
    wrapAmount,
    canFullyWrap,
    chainId,
    sendCallsAsync,
    approve,
    setOpen,
    refetchAllowance,
    allowance,
    refetchNative,
    refetchWusde,
    refetchErc20,
    toast,
    approveAmountWei,
  ]);

  const isProcessing =
    isApproving || isSendingCalls || isSubmitting || isWaitingForAllowance;

  useEffect(() => {
    if (!approveAmount && allowance != null) setApproveAmount(allowanceDisplay);
  }, [allowance, allowanceDisplay]);

  // Check if user has enough balance for the requested amount
  const hasInsufficientBalance = useMemo(() => {
    if (approveAmountWei <= 0n) return false;
    return approveAmountWei > effectiveBalanceWei;
  }, [approveAmountWei, effectiveBalanceWei]);

  const needsMoreWusdeWrap = useMemo(() => {
    if (!isEtherealChain) return false;
    return needsWrapping && !canFullyWrap;
  }, [isEtherealChain, needsWrapping, canFullyWrap]);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[380px] pt-6">
        <DialogHeader>
          <DialogTitle>Approved Spend</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={approveAmount}
              onChange={(e) => setApproveAmount(e.target.value.trim())}
              className="h-10 pr-20"
              disabled={isProcessing}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              USDe
            </span>
          </div>

          {/* Account Balance Display */}
          <div className="text-xs text-muted-foreground !mt-2">
            <span>Account Balance: </span>
            <span className="text-brand-white font-mono">
              {effectiveBalanceDisplay} USDe
            </span>
          </div>

          <Button
            className="w-full h-10"
            onClick={handleSubmit}
            disabled={
              !approveAmount ||
              isProcessing ||
              !collateralAddress ||
              !SPENDER_ADDRESS ||
              hasInsufficientBalance ||
              needsMoreWusdeWrap ||
              isPermitLoading ||
              isRestricted ||
              (requiredAmountWei != null &&
                approveAmountWei < requiredAmountWei)
            }
          >
            {isProcessing
              ? 'Submitting…'
              : hasInsufficientBalance
                ? 'Insufficient Balance'
                : needsMoreWusdeWrap
                  ? 'Insufficient USDe to Wrap'
                  : 'Submit'}
          </Button>

          <RestrictedJurisdictionBanner
            show={!isPermitLoading && isRestricted}
            iconClassName="h-4 w-4"
          />

          {requiredAmount &&
          !hasInsufficientBalance &&
          requiredAmountWei != null &&
          approveAmountWei < requiredAmountWei ? (
            <div className="text-[11px] text-amber-500">
              Enter at least {requiredAmount} USDe
            </div>
          ) : null}

          {needsMoreWusdeWrap ? (
            <div className="text-[11px] text-amber-500">
              You need to wrap enough native USDe into wUSDe (leaving{' '}
              {GAS_RESERVE} USDe for gas) before approving this amount.
            </div>
          ) : null}

          {isLoadingAllowance ? (
            <div className="text-xs text-muted-foreground">
              Refreshing allowance…
            </div>
          ) : null}

          {isWaitingForAllowance ? (
            <div className="text-xs text-muted-foreground">
              Waiting for updated allowance…
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalDialog;
