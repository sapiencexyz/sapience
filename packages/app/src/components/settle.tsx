import { Loader2 } from 'lucide-react';
import { useState, useEffect, useContext } from 'react';
import { formatUnits } from 'viem';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

import { Button } from '~/components/ui/button';
import { useToast } from '~/hooks/use-toast';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';

export default function Settle() {
  const { address, isConnected } = useAccount();

  const {
    address: marketAddress,
    foilData,
    chainId,
    epochSettled,
    settlementPrice,
    collateralAssetTicker,
    unitDisplay,
  } = useContext(PeriodContext);
  const { nftId, setNftId, positions } = useAddEditPosition();
  const [withdrawableCollateral, setWithdrawableCollateral] = useState<bigint>(
    BigInt(0)
  );
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const { toast } = useToast();

  const { isLoadingBalance, isLoadingContracts, refetch } = useTokenIdsOfOwner(
    address as `0x${string}`
  );

  const { data: positionData } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilData.abi,
    functionName: 'getPosition',
    args: [nftId ?? 0],
    chainId,
  });

  const { writeContract, data: writeHash } = useWriteContract();

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast({
        title: 'Success',
        description: 'Position settled successfully!',
      });
      setIsSettling(false);
      refetch();
      setNftId(0);
      setWithdrawableCollateral(BigInt(0));
    }
  }, [isConfirmed, toast, refetch, setNftId]);

  useEffect(() => {
    if (positionData) {
      setWithdrawableCollateral(
        BigInt((positionData as any).depositedCollateralAmount)
      );
    }
  }, [positionData]);

  const handleSettle = async () => {
    if (nftId !== 0 && foilData) {
      setIsSettling(true);
      try {
        await writeContract({
          address: foilData.address as `0x${string}`,
          abi: foilData.abi,
          functionName: 'settlePosition',
          chainId,
          args: [BigInt(nftId ?? 0)],
        });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Failed to settle position',
          description: (error as Error).message,
        });
        setIsSettling(false);
      }
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-lg text-muted-foreground text-center p-8 m-auto">
          Connect your wallet to view positions in this market.
        </h2>
      </div>
    );
  }

  if (isLoadingBalance || isLoadingContracts) {
    return (
      <div className="flex  flex-col h-full justify-center items-center w-full m-auto">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-50" />
      </div>
    );
  }

  if (
    positions?.tradePositions?.length === 0 &&
    positions?.liquidityPositions?.length === 0
  ) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-lg text-muted-foreground text-center p-8 m-auto">
          The connected wallet has no positions in this market.
        </h2>
      </div>
    );
  }

  return (
    <div className="py-5 px-6">
      <h2 className="text-lg text-muted-foreground mb-4">Settle Position</h2>
      <div className="mb-4">
        <PositionSelector />
      </div>
      {withdrawableCollateral > BigInt(0) && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-0.5">
            {!(epochSettled && settlementPrice) ? 'Anticipated' : null}{' '}
            Withdrawable Collateral
          </p>
          <p className="text-sm">
            <NumberDisplay value={formatUnits(withdrawableCollateral, 18)} />{' '}
            {collateralAssetTicker}
          </p>
        </div>
      )}
      {epochSettled && settlementPrice ? (
        <>
          <div className="mb-6">
            <p className="text-sm font-semibold mb-0.5">Settlement Price</p>
            <p className="text-sm">
              <NumberDisplay value={formatUnits(settlementPrice, 18)} />{' '}
              {unitDisplay()}
            </p>
          </div>
          <Button
            className="w-full"
            onClick={handleSettle}
            disabled={
              nftId === 0 || isSettling || withdrawableCollateral === BigInt(0)
            }
            variant="default"
          >
            {isSettling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Settle Position
          </Button>
        </>
      ) : (
        <Button className="w-full" disabled variant="default">
          Awaiting settlement price
        </Button>
      )}
    </div>
  );
}
