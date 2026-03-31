import { useState, useCallback, useMemo } from 'react';
import { useBalance, useReadContract, useWriteContract, useSendTransaction } from 'wagmi';
import { erc20Abi, parseEther, formatEther, encodeFunctionData, type Address } from 'viem';
import {
  collateralToken as collateralTokenAddresses,
  predictionMarketEscrow as predictionMarketEscrowAddresses,
} from '@sapience/sdk/contracts';
import { useSession } from '../lib/SessionContext';

const GAS_RESERVE = parseEther('0.5');

export interface TokenSetupState {
  nativeBalance: bigint;
  wusdeBalance: bigint;
  escrowAllowance: bigint;
  effectiveBalance: bigint;
  effectiveBalanceFormatted: string;
  allowanceFormatted: string;
  isReady: boolean;
  approve: (amount: bigint) => Promise<void>;
  isApproving: boolean;
  approveError: string | null;
  refetchAllowance: () => void;
  wusdeAddress: Address | undefined;
  escrowAddress: Address | undefined;
}

export function useTokenSetup(chainId: number): TokenSetupState {
  const { effectiveAddress, isSessionActive, etherealClient } = useSession();
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const wusdeAddress = collateralTokenAddresses[chainId]?.address;
  const escrowAddress = predictionMarketEscrowAddresses[chainId]?.address;

  // Native USDe balance (for Ethereal chains, native token IS USDe)
  const { data: nativeBal } = useBalance({
    address: effectiveAddress ?? undefined,
    chainId,
    query: { enabled: !!effectiveAddress },
  });

  // wUSDe balance
  const { data: wusdeBal } = useReadContract({
    abi: erc20Abi,
    address: wusdeAddress,
    functionName: 'balanceOf',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: { enabled: !!effectiveAddress && !!wusdeAddress },
  });

  // Allowance to escrow
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: wusdeAddress,
    functionName: 'allowance',
    args: effectiveAddress && escrowAddress ? [effectiveAddress, escrowAddress] : undefined,
    chainId,
    query: { enabled: !!effectiveAddress && !!wusdeAddress && !!escrowAddress },
  });

  const nativeBalance = nativeBal?.value ?? 0n;
  const wusdeBalance = (wusdeBal as bigint) ?? 0n;
  const escrowAllowance = (allowance as bigint) ?? 0n;

  // Effective balance = native + wrapped - gas reserve
  const effectiveBalance = useMemo(() => {
    const total = nativeBalance + wusdeBalance;
    if (total <= GAS_RESERVE) return 0n;
    return total - GAS_RESERVE;
  }, [nativeBalance, wusdeBalance]);

  const isReady = escrowAllowance > 0n;

  // Manual EOA approve (user signs this manually — NOT via session key)
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const approve = useCallback(
    async (amount: bigint) => {
      if (!effectiveAddress || !wusdeAddress || !escrowAddress) return;

      setIsApproving(true);
      setApproveError(null);

      try {
        if (isSessionActive && etherealClient) {
          // Session mode: batch wrap + approve via smart account UserOp (gasless)
          const account = etherealClient.account;
          if (!account || !('encodeCalls' in account)) throw new Error('No smart account');

          const calls: { to: Address; data: `0x${string}`; value: bigint }[] = [];

          // Wrap native USDe if needed
          if (wusdeBalance < amount && nativeBalance > GAS_RESERVE) {
            const wrapAmount = amount - wusdeBalance;
            const maxWrap = nativeBalance - GAS_RESERVE;
            const toWrap = wrapAmount > maxWrap ? maxWrap : wrapAmount;
            if (toWrap > 0n) {
              calls.push({
                to: wusdeAddress,
                data: '0xd0e30db0', // deposit()
                value: toWrap,
              });
            }
          }

          // Approve escrow to spend wUSDe
          calls.push({
            to: wusdeAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [escrowAddress, amount],
            }),
            value: 0n,
          });

          await etherealClient.sendUserOperation({
            callData: await (account as { encodeCalls: (calls: { to: Address; data: `0x${string}`; value: bigint }[]) => Promise<`0x${string}`> }).encodeCalls(calls),
          });
        } else {
          // EOA mode: send transactions directly from wallet
          if (wusdeBalance < amount && nativeBalance > GAS_RESERVE) {
            const wrapAmount = amount - wusdeBalance;
            const maxWrap = nativeBalance - GAS_RESERVE;
            const toWrap = wrapAmount > maxWrap ? maxWrap : wrapAmount;

            if (toWrap > 0n) {
              await sendTransactionAsync({
                to: wusdeAddress,
                value: toWrap,
                data: '0xd0e30db0', // deposit()
              });
            }
          }

          await writeContractAsync({
            abi: erc20Abi,
            address: wusdeAddress,
            functionName: 'approve',
            args: [escrowAddress, amount],
            chainId,
          });
        }

        // Poll for allowance update
        const startedAt = Date.now();
        while (Date.now() - startedAt < 45_000) {
          const result = await refetchAllowance();
          const latest = (result?.data as bigint) ?? 0n;
          if (latest >= amount) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Approval failed';
        console.error('[useTokenSetup] Approve failed:', err);
        setApproveError(msg);
      } finally {
        setIsApproving(false);
      }
    },
    [
      effectiveAddress,
      wusdeAddress,
      escrowAddress,
      wusdeBalance,
      nativeBalance,
      isSessionActive,
      etherealClient,
      sendTransactionAsync,
      writeContractAsync,
      chainId,
      refetchAllowance,
    ],
  );

  return {
    nativeBalance,
    wusdeBalance,
    escrowAllowance,
    effectiveBalance,
    effectiveBalanceFormatted: formatEther(effectiveBalance),
    allowanceFormatted: formatEther(escrowAllowance),
    isReady,
    approve,
    isApproving,
    approveError,
    refetchAllowance,
    wusdeAddress,
    escrowAddress,
  };
}
