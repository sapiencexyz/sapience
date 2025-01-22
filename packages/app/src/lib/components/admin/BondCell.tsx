import { Loader2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { zeroAddress } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';

import { Button } from '@/components/ui/button';
import { useToast } from '~/hooks/use-toast';
import erc20ABI from '~/lib/erc20abi.json';

import { AddressCell } from './AddressCell';
import type { BondCellProps } from './types';

export const BondCell: React.FC<BondCellProps> = ({
  market,
  epoch,
  bondAmount,
  bondCurrency,
  vaultAddress,
}) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, vaultAddress],
    account: address || zeroAddress,
    chainId: market.chainId,
    query: {
      enabled: !!address && !!bondAmount && !!vaultAddress && !!bondCurrency,
    },
  });

  const { writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        console.error('Failed to approve: ', error);
        setIsApproving(false);
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: (error as Error).message,
        });
      },
      onSuccess: () => {
        toast({
          title: 'Approval successful',
          description: 'Bond amount has been approved',
        });
        setIsApproving(false);
        refetchAllowance();
      },
    },
  });

  const handleApprove = () => {
    if (!bondAmount || !bondCurrency) return;
    setIsApproving(true);
    approveWrite({
      abi: erc20ABI,
      address: bondCurrency as `0x${string}`,
      functionName: 'approve',
      args: [vaultAddress, bondAmount],
      chainId: market.chainId,
    });
  };

  if (!bondAmount || !bondCurrency || !vaultAddress) {
    return <span>Loading...</span>;
  }

  const requiresApproval = !allowance || bondAmount > (allowance as bigint);

  return (
    <div className="flex flex-col">
      <div className="text-xs">
        Currency:{' '}
        <AddressCell address={bondCurrency} chainId={market.chainId} />
      </div>
      <div className="text-xs">Required: {bondAmount.toString()}</div>
      <div className="text-xs">Approved: {allowance?.toString() || '0'}</div>
      {requiresApproval && (
        <Button size="sm" onClick={handleApprove} disabled={isApproving}>
          {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Approve Bond
        </Button>
      )}
    </div>
  );
};
