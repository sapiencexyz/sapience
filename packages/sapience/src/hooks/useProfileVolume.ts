'use client';

import * as React from 'react';
import type { PositionType } from '@sapience/sdk/types';
import type { Parlay } from '~/hooks/graphql/useUserParlays';
import { formatUnits } from 'viem';
import { bigIntAbs, formatFiveSigFigs } from '~/lib/utils/util';

export function useProfileVolume(
  positions: PositionType[] | undefined,
  parlays: Parlay[] | undefined,
  address?: string
) {
  return React.useMemo(() => {
    try {
      let total = 0;
      const viewer = String(address || '').toLowerCase();

      for (const p of positions || []) {
        const txs = [...(p.transactions || [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        let lastCollateral = 0n;
        const dec = Number(p.market?.marketGroup?.collateralDecimals ?? 18);
        for (const t of txs) {
          const type = String(t.type);
          if (type === 'addLiquidity' || type === 'removeLiquidity') continue;
          const currentRaw = t.collateralTransfer?.collateral ?? t.collateral;
          let current = 0n;
          try {
            current = BigInt(currentRaw ?? '0');
          } catch {
            current = 0n;
          }
          const delta = current - lastCollateral;
          const abs = bigIntAbs(delta);
          lastCollateral = current;
          const human = Number(formatUnits(abs, dec));
          if (Number.isFinite(human)) total += human;
        }
      }

      for (const parlay of parlays || []) {
        try {
          const makerIsUser =
            typeof parlay.maker === 'string' &&
            parlay.maker.toLowerCase() === viewer;
          const takerIsUser =
            typeof parlay.taker === 'string' &&
            parlay.taker.toLowerCase() === viewer;
          if (makerIsUser && parlay.makerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.makerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
          if (takerIsUser && parlay.takerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.takerCollateral), 18)
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
  }, [positions, parlays, address]);
}
