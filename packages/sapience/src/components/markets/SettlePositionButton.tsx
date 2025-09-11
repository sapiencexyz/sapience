import { Button } from '@sapience/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { InfoIcon } from 'lucide-react';

import { useSettlePosition } from '~/hooks/contract/useSettlePosition';
import { MINIMUM_POSITION_WIN } from '~/lib/constants/numbers';

interface SettlePositionButtonProps {
  positionId: string;
  marketAddress: string;
  chainId: number;
  isMarketSettled: boolean;
  onSuccess?: () => void;
}

const SettlePositionButton = ({
  positionId,
  marketAddress,
  chainId,
  isMarketSettled,
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
    onSuccess,
    onError: (error) => {
      // Error handling is now done automatically by useSapienceWriteContract
      // but we can also handle it here if needed
      console.error('Settlement error:', error);
    },
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

  // Handle simulation errors (separate from transaction errors)
  useEffect(() => {
    if (error && isMarketSettled) {
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
      // Error handling is now done automatically by useSapienceWriteContract
      console.error('Settlement error:', err);
    }
  };

  if (!isMarketSettled) {
    return (
      <span className="inline-flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-[260px]">
                Gathering resolution criteria and processing decentralized
                verification generally takes hours after the end time of the
                market
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="outline"
          size="sm"
          disabled
          className="disabled:cursor-not-allowed"
        >
          Awaiting Settlement
        </Button>
      </span>
    );
  }

  // If the position is lost, show a "Wager Lost" badge
  if (isLost && !loadingSimulation) {
    return (
      <Button
        variant="outline"
        size="sm"
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
      size="sm"
      onClick={handleSettle}
      disabled={isSettling || loadingSimulation}
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
