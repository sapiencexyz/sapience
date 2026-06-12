'use client';

import { useQuery } from '@tanstack/react-query';
import PositionDetails from '~/components/positions/PositionDetails';
import type { ConditionsMap } from '~/components/positions/toPickLegs';
import type { PositionBalance } from '~/hooks/graphql/usePositions';
import { fetchPositionById } from '~/lib/data/positions';

export default function PositionPageClient({
  positionId,
  serverPosition,
}: {
  positionId: string;
  serverPosition: PositionBalance | null;
}) {
  const {
    data: clientPosition,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['positionById', positionId],
    queryFn: () => fetchPositionById(Number(positionId)),
    enabled: !serverPosition,
  });

  const position = serverPosition ?? clientPosition ?? null;

  if (!serverPosition && isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading position...
        </div>
      </div>
    );
  }

  if (!serverPosition && isError) {
    return (
      <div className="text-center text-muted-foreground">
        Failed to load position. Please check your connection and try again.
      </div>
    );
  }

  if (!position?.pickConfig) {
    return (
      <div className="text-center text-muted-foreground">
        Position not found.
      </div>
    );
  }

  // Same inline-conditions shortcut PositionsTable uses: the server embeds
  // each pick's condition, so no second round trip is needed.
  const conditionsMap: ConditionsMap = new Map();
  for (const pick of position.pickConfig.picks ?? []) {
    if (pick.condition && !conditionsMap.has(pick.conditionId)) {
      conditionsMap.set(pick.conditionId, pick.condition);
    }
  }

  return <PositionDetails position={position} conditionsMap={conditionsMap} />;
}
