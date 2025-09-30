import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemo, useEffect, useRef } from 'react';
import { formatUnits } from 'viem';
import NumberDisplay from '~/components/shared/NumberDisplay';
import AwaitingSettlementBadge from '~/components/shared/AwaitingSettlementBadge';

import { useSettlePosition } from '~/hooks/contract/useSettlePosition';
import { MINIMUM_POSITION_WIN } from '~/lib/constants/numbers';

// Cache settlement check results across remounts to prevent repeated re-checks
// Keyed by chainId:marketAddress:positionId
const settlementStatusCache = new Map<string, 'already_settled' | 'lost'>();

interface SettlePositionButtonProps {
  positionId: string;
  marketAddress: string;
  chainId: number;
  isMarketSettled: boolean;
  onSuccess?: () => void;
  collateralSymbol?: string;
  collateralDecimals?: number;
}

const SettlePositionButton = ({
  positionId,
  marketAddress,
  chainId,
  isMarketSettled,
  onSuccess,
  collateralSymbol,
  collateralDecimals,
}: SettlePositionButtonProps) => {
  const { toast } = useToast();

  const {
    settlePosition,
    simulationData,
    loadingSimulation,
    isSettling,
    error,
    simulateSettlement,
  } = useSettlePosition({
    positionId,
    marketAddress,
    chainId,
    enabled: false, // Don't auto-run simulation on mount
    onSuccess,
    onError: (error) => {
      // Error handling is now done automatically by useSapienceWriteContract
      // but we can also handle it here if needed
      console.error('Settlement error:', error);
    },
  });

  // Track if we've already triggered simulation to avoid infinite loops
  const simulationTriggeredRef = useRef(false);

  // Build a stable cache key for this position
  const cacheKey = `${chainId}:${marketAddress}:${positionId}`;
  const cachedStatus = settlementStatusCache.get(cacheKey);
  const cachedAlreadySettled = cachedStatus === 'already_settled';
  const cachedLost = cachedStatus === 'lost';

  // Trigger simulation when market is settled (one-time)
  useEffect(() => {
    if (
      isMarketSettled &&
      !simulationTriggeredRef.current &&
      positionId &&
      marketAddress &&
      chainId &&
      !cachedStatus // Do not re-simulate if we already know the result
    ) {
      simulationTriggeredRef.current = true;
      simulateSettlement();
    }
  }, [
    isMarketSettled,
    positionId,
    marketAddress,
    chainId,
    simulateSettlement,
    cachedStatus,
  ]);

  // Reset simulation trigger when position changes
  useEffect(() => {
    simulationTriggeredRef.current = false;
  }, [positionId, marketAddress]);

  // Check if we have simulation data and what the expected payout is
  const hasSimulationData = simulationData?.result != null;
  const expectedCollateral = hasSimulationData
    ? (simulationData.result as bigint)
    : null;

  // Check if position is already settled based on simulation error
  const isAlreadySettled = useMemo(() => {
    if (error) {
      const errorMessage = error.message.toLowerCase();
      return (
        errorMessage.includes('positionAlreadySettled'.toLowerCase()) ||
        errorMessage.includes('already settled')
      );
    }
    return false;
  }, [error]);

  // Persist known results into cache to survive remounts
  useEffect(() => {
    if (isMarketSettled && isAlreadySettled) {
      settlementStatusCache.set(cacheKey, 'already_settled');
    }
  }, [isMarketSettled, isAlreadySettled, cacheKey]);

  // Only determine if position is lost when we have actual simulation data
  const isLost = useMemo(() => {
    if (!hasSimulationData || expectedCollateral == null) {
      return false; // Don't assume lost without data
    }
    return expectedCollateral < MINIMUM_POSITION_WIN;
  }, [hasSimulationData, expectedCollateral]);

  useEffect(() => {
    if (isMarketSettled && hasSimulationData && isLost) {
      settlementStatusCache.set(cacheKey, 'lost');
    }
  }, [isMarketSettled, hasSimulationData, isLost, cacheKey]);

  // Handle simulation errors (separate from transaction errors)
  // Only show toast for unexpected errors, not expected ones like "already settled"
  useEffect(() => {
    if (error && isMarketSettled) {
      const errorMessage = error.message.toLowerCase();
      const isExpectedError =
        errorMessage.includes('positionAlreadySettled'.toLowerCase()) ||
        errorMessage.includes('already settled') ||
        errorMessage.includes('notAccountOwner'.toLowerCase()) ||
        errorMessage.includes('not account owner');

      if (!isExpectedError) {
        toast({
          variant: 'destructive',
          title: 'Settlement Check Failed',
          description: error.message,
        });
      }
    }
  }, [error, toast, isMarketSettled]);

  const handleSettle = async () => {
    try {
      await settlePosition();
    } catch (err) {
      // Error handling is now done automatically by useSapienceWriteContract
      console.error('Settlement error:', err);
    }
  };

  if (!isMarketSettled) {
    return <AwaitingSettlementBadge />;
  }

  // If position is already settled, show settled state
  if (isMarketSettled && (isAlreadySettled || cachedAlreadySettled)) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 cursor-not-allowed"
      >
        Settled
      </Button>
    );
  }

  // Show loading state while checking settlement value
  if (isMarketSettled && loadingSimulation && !cachedStatus) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="disabled:cursor-not-allowed"
      >
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Checking...
      </Button>
    );
  }

  // If the position is lost (confirmed via simulation), show a "Wager Lost" badge
  if (
    isMarketSettled &&
    (isLost || cachedLost) &&
    (hasSimulationData || cachedLost)
  ) {
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

  // Market is settled and we can show the settle button
  // (either we have simulation data showing it's profitable, or we allow settling without simulation as a fallback)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSettle}
      disabled={isSettling}
    >
      {isSettling ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Claiming...
        </>
      ) : (
        <>
          Claim
          {hasSimulationData && expectedCollateral != null ? (
            <>
              {' '}
              <NumberDisplay
                value={Number(
                  formatUnits(
                    expectedCollateral,
                    typeof collateralDecimals === 'number' &&
                      Number.isFinite(collateralDecimals)
                      ? collateralDecimals
                      : 18
                  )
                )}
              />{' '}
              {collateralSymbol || 'tokens'}
            </>
          ) : null}
        </>
      )}
    </Button>
  );
};

export default SettlePositionButton;
