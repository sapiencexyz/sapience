'use client';

import { useState, useEffect } from 'react';
import {
  onMeshPeerCountChange,
  getMeshPeerCount,
} from '~/lib/ws/MeshAuctionClient';

/**
 * Returns current peer count from the relay mesh.
 * Updates reactively when peers connect/disconnect.
 */
export function usePeerMesh() {
  const [peerCount, setPeerCount] = useState<number>(getMeshPeerCount());

  useEffect(() => {
    setPeerCount(getMeshPeerCount());
    const unsub = onMeshPeerCountChange((count) => {
      setPeerCount(count);
    });
    return unsub;
  }, []);

  return { peerCount };
}
