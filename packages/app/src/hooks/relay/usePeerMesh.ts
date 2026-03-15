'use client';

import { useState, useEffect } from 'react';
import {
  onMeshPeerCountChange,
  onMeshBandwidthChange,
  getMeshPeerCount,
  getMeshBandwidthKbps,
} from '~/lib/ws/MeshAuctionClient';

export function usePeerMesh() {
  const [peerCount, setPeerCount] = useState(getMeshPeerCount());
  const [bandwidthKbps, setBandwidthKbps] = useState(getMeshBandwidthKbps());

  useEffect(() => {
    setPeerCount(getMeshPeerCount());
    setBandwidthKbps(getMeshBandwidthKbps());
    const u1 = onMeshPeerCountChange(setPeerCount);
    const u2 = onMeshBandwidthChange(setBandwidthKbps);
    return () => {
      u1();
      u2();
    };
  }, []);

  return { peerCount, bandwidthKbps };
}
