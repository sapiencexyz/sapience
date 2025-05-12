import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

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
  } = useSettlePosition({
    positionId,
    marketAddress,
    chainId,
    enabled: true,
  });

  const expectedCollateral = useMemo(
    () => simulationData?.result || BigInt(0),
    [simulationData]
  );

  // Check if position lost (collateral is less than minimum win threshold)
  const isLost = useMemo(
    () => expectedCollateral < MINIMUM_POSITION_WIN,
    [expectedCollateral]
  );

  const handleSettle = async () => {
    try {
      const hash = await settlePosition(positionId);

      if (hash) {
        toast({
          title: 'Success!',
          description: 'Position settled successfully',
        });

        // Call the onSuccess callback if provided
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      console.error('Error settling position:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to settle position',
      });
    }
  };

  // If the position is lost, show a "Wager Lost" badge
  if (isLost && !loadingSimulation) {
    return (
      <Badge
        variant="outline"
        className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
      >
        Wager Lost
      </Badge>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSettle}
      disabled={isSettling || loadingSimulation}
      className="bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 dark:border-green-800"
    >
      {isSettling || loadingSimulation ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {isSettling ? 'Settling...' : 'Simulating...'}
        </>
      ) : (
        'Settle'
      )}
    </Button>
  );
};

export default SettlePositionButton;
