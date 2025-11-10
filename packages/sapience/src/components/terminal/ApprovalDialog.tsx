'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from './ApprovalDialogContext';

const ApprovalDialog: React.FC = () => {
  const { isOpen, setOpen, requiredAmount } = useApprovalDialog();
  const chainId = useChainIdFromLocalStorage();

  const COLLATERAL_ADDRESS = DEFAULT_COLLATERAL_ASSET as
    | `0x${string}`
    | undefined;
  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  const { data: tokenSymbolRaw } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'symbol',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  const [approveAmount, setApproveAmount] = useState<string>('');

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

  const {
    allowance,
    isLoadingAllowance,
    approve,
    isApproving,
    refetchAllowance,
  } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: SPENDER_ADDRESS,
    amount: approveAmount,
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(COLLATERAL_ADDRESS && SPENDER_ADDRESS),
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
  const tokenSymbol =
    typeof tokenSymbolRaw === 'string' && tokenSymbolRaw
      ? tokenSymbolRaw
      : 'USDe';

  useEffect(() => {
    if (!approveAmount && allowance != null) setApproveAmount(allowanceDisplay);
  }, [allowance, allowanceDisplay]);

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
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {tokenSymbol}
            </span>
          </div>

          <Button
            className="w-full h-10"
            onClick={async () => {
              try {
                await approve();
                setTimeout(() => refetchAllowance(), 2000);
              } catch {
                // no-op
              }
            }}
            disabled={
              !approveAmount ||
              isApproving ||
              !COLLATERAL_ADDRESS ||
              (requiredAmount != null &&
                Number(approveAmount || '0') < Number(requiredAmount))
            }
          >
            {isApproving ? 'Submitting…' : 'Submit'}
          </Button>

          {requiredAmount &&
          Number(approveAmount || '0') < Number(requiredAmount) ? (
            <div className="text-[11px] text-amber-500">
              Enter at least {requiredAmount} {tokenSymbol}
            </div>
          ) : null}

          {isLoadingAllowance ? (
            <div className="text-xs text-muted-foreground">
              Refreshing allowance…
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalDialog;
