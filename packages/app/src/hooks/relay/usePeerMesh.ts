'use client';

import { useState, useEffect } from 'react';
import {
  onMeshPeerCountChange,
  onMeshBandwidthChange,
  onMeshSignalStateChange,
  getMeshPeerCount,
  getMeshBandwidthKbps,
  getMeshSignalConnected,
  getMeshKnownPeerCount,
} from '~/lib/ws/MeshAuctionClient';

export function usePeerMesh() {
  const [peerCount, setPeerCount] = useState(getMeshPeerCount());
  const [bandwidthKbps, setBandwidthKbps] = useState(getMeshBandwidthKbps());
  const [signalConnected, setSignalConnected] = useState(
    getMeshSignalConnected()
  );
  const [knownPeerCount, setKnownPeerCount] = useState(getMeshKnownPeerCount());

  useEffect(() => {
    setPeerCount(getMeshPeerCount());
    setBandwidthKbps(getMeshBandwidthKbps());
    setSignalConnected(getMeshSignalConnected());
    setKnownPeerCount(getMeshKnownPeerCount());
    const u1 = onMeshPeerCountChange((count) => {
      setPeerCount(count);
      setKnownPeerCount(getMeshKnownPeerCount());
    });
    const u2 = onMeshBandwidthChange(setBandwidthKbps);
    const u3 = onMeshSignalStateChange((connected) => {
      setSignalConnected(connected);
      setKnownPeerCount(getMeshKnownPeerCount());
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  return { peerCount, bandwidthKbps, signalConnected, knownPeerCount };
}
