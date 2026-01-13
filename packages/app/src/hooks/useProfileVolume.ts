'use client';

import * as React from 'react';
import type { Position } from '~/hooks/graphql/useUserPositions';
import { formatUnits } from 'viem';
import { formatFiveSigFigs } from '~/lib/utils/util';

export function useProfileVolume(
  positions: Position[] | undefined,
  address?: string
) {
  return React.useMemo(() => {
    try {
      let total = 0;
      const viewer = String(address || '').toLowerCase();

      for (const position of positions || []) {
        try {
          const predictorIsUser =
            typeof position.predictor === 'string' &&
            position.predictor.toLowerCase() === viewer;
          const counterpartyIsUser =
            typeof position.counterparty === 'string' &&
            position.counterparty.toLowerCase() === viewer;
          if (predictorIsUser && position.predictorCollateral) {
            const human = Number(
              formatUnits(BigInt(position.predictorCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
          if (counterpartyIsUser && position.counterpartyCollateral) {
            const human = Number(
              formatUnits(BigInt(position.counterpartyCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
        } catch {
          // ignore
        }
      }

      const value = total;
      return { value, display: formatFiveSigFigs(value) };
    } catch {
      return { value: 0, display: '0' };
    }
  }, [positions, address]);
}
