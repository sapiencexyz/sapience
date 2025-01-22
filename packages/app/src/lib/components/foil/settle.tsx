import { Loader } from 'lucide-react';
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
import { MarketContext } from '~/lib/context/MarketProvider';
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
  } = useContext(MarketContext);
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
      <h2 className="text-xl font-semibold text-center p-8">
        Connect your wallet to settle positions
      </h2>
    );
  }

  if (isLoadingBalance || isLoadingContracts) {
    return (
      <div className="text-center">
        <Loader className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (
    positions?.tradePositions?.length === 0 &&
    positions?.liquidityPositions?.length === 0
  ) {
    return (
      <h2 className="text-xl font-semibold text-center p-8">
        The connected wallet has no positions in this epoch
      </h2>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Settle Position</h2>
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
              wstETH/Ggas
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
            {isSettling && <Loader className="mr-2 h-4 w-4 animate-spin" />}
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
