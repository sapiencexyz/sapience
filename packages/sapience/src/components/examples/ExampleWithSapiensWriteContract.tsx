import { useCallback } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { useSapiensWriteContract } from '~/hooks/blockchain/useSapiensWriteContract';

// Example ABI for ERC20 approve function
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface ExampleWithSapiensWriteContractProps {
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  amount: bigint;
  chainId: number;
}

export function ExampleWithSapiensWriteContract({
  tokenAddress,
  spenderAddress,
  amount,
  chainId,
}: ExampleWithSapiensWriteContractProps) {
  const { writeContract, isPending, txHash } = useSapiensWriteContract({
    chainId,
    successMessage: 'Token approved successfully!',
    fallbackErrorMessage: 'Failed to approve token',
    onSuccess: (receipt) => {
      console.log('Approval successful:', receipt);
      // You can add custom logic here
    },
    onError: (error) => {
      console.error('Approval failed:', error);
      // You can add custom error handling here
    },
  });

  const handleApprove = useCallback(async () => {
    try {
      // This uses the exact same parameters as wagmi's writeContract
      await writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amount],
      });
    } catch (error) {
      // Chain validation errors are handled automatically
      // This catch block is for any other unexpected errors
      console.error('Unexpected error:', error);
    }
  }, [writeContract, tokenAddress, spenderAddress, amount]);

  return (
    <div className="space-y-4">
      <Button onClick={handleApprove} disabled={isPending} className="w-full">
        {isPending ? 'Approving...' : 'Approve Token'}
      </Button>

      {txHash && (
        <div className="text-sm text-muted-foreground">
          Transaction Hash: {txHash}
        </div>
      )}
    </div>
  );
}

// Example with complex transaction parameters
interface ComplexTransactionExampleProps {
  marketAddress: `0x${string}`;
  marketAbi: any;
  chainId: number;
  marketId: number;
  size: bigint;
  maxCollateral: bigint;
}

export function ComplexTransactionExample({
  marketAddress,
  marketAbi,
  chainId,
  marketId,
  size,
  maxCollateral,
}: ComplexTransactionExampleProps) {
  const { writeContract, isPending, txHash } = useSapiensWriteContract({
    chainId,
    successMessage: 'Trade created successfully!',
    fallbackErrorMessage: 'Failed to create trade',
  });

  const handleCreateTrade = useCallback(async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 minutes

    const tradeParams = {
      marketId,
      size,
      maxCollateral,
      deadline,
    };

    await writeContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: 'createTraderPosition',
      args: [tradeParams],
    });
  }, [writeContract, marketAddress, marketAbi, marketId, size, maxCollateral]);

  return (
    <div className="space-y-4">
      <Button
        onClick={handleCreateTrade}
        disabled={isPending}
        className="w-full"
      >
        {isPending ? 'Creating Trade...' : 'Create Trade'}
      </Button>

      {txHash && (
        <div className="text-sm text-muted-foreground">
          Transaction Hash: {txHash}
        </div>
      )}
    </div>
  );
}
