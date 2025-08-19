import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemo, useEffect, useRef } from 'react';

import { useSettlePosition } from '~/hooks/contract/useSettlePosition';
import { MINIMUM_POSITION_WIN } from '~/lib/constants/numbers';

interface SettlePositionButtonProps {
  positionId: string;
  marketAddress: string;
  chainId: number;
  onSuccess?: () => void;
}

const SettlePositionButton = ({
  positionId,
  marketAddress,
  chainId,
  onSuccess,
}: SettlePositionButtonProps) => {
  const { toast } = useToast();

  const {
    settlePosition,
    simulationData,
    loadingSimulation,
    isSettling,
    error,
    txHash,
  } = useSettlePosition({
    positionId,
    marketAddress,
    chainId,
    enabled: true,
  });

  const successHandled = useRef(false);

  const expectedCollateral = useMemo(
    () => simulationData?.result || BigInt(0),
    [simulationData]
  );

  // Check if position lost (collateral is less than minimum win threshold)
  const isLost = useMemo(
    () => expectedCollateral < MINIMUM_POSITION_WIN,
    [expectedCollateral]
  );

  useEffect(() => {
    if (txHash && !successHandled.current) {
      successHandled.current = true;
      toast({
        title: 'Success!',
        description: 'Position settled successfully',
      });
      if (onSuccess) onSuccess();
    }
  }, [txHash, onSuccess, toast]);

  useEffect(() => {
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  }, [error, toast]);

  const handleSettle = async () => {
    try {
      await settlePosition();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to settle position';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  // If the position is lost, show a "Wager Lost" badge
  if (isLost && !loadingSimulation) {
    return (
      <Button
        variant="outline"
        size="xs"
        disabled
        className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 cursor-not-allowed"
      >
        Wager Lost
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="xs"
      onClick={handleSettle}
      disabled={isSettling || loadingSimulation}
      className="bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 dark:border-green-800"
    >
      {isSettling || loadingSimulation ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {isSettling ? 'Settling...' : 'Loading...'}
        </>
      ) : (
        'Settle'
      )}
    </Button>
  );
};

export default SettlePositionButton;
