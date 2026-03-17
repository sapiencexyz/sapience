'use client';

import { useState, useEffect } from 'react';
import { useAnimatedNumber } from '~/hooks/useAnimatedNumber';
import { usePeerMesh } from '~/hooks/relay/usePeerMesh';

/** Grace period before showing "CAN'T REACH MESH" to avoid flash on startup. */
const GRACE_MS = 10_000;

function fmtBw(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} MBPS`;
  return `${kbps.toFixed(1)} KBPS`;
}

export function PeerIndicator() {
  const { peerCount, bandwidthKbps, signalConnected, knownPeerCount } =
    usePeerMesh();
  const animatedBw = useAnimatedNumber(peerCount > 0 ? bandwidthKbps : null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Can't reach mesh: after grace period, either signal is down or
  // we know about peers but can't establish any WebRTC connections
  const cantReachMesh =
    ready && peerCount === 0 && (!signalConnected || knownPeerCount > 0);

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs uppercase">
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          peerCount > 0
            ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'
            : 'bg-muted-foreground/40'
        } ${cantReachMesh ? 'animate-pulse' : ''}`}
      />
      <span className="text-muted-foreground/60 tabular-nums">
        {cantReachMesh ? (
          'MESH PENDING'
        ) : (
          <>
            <span className="text-muted-foreground">
              {peerCount} {peerCount === 1 ? 'PEER' : 'PEERS'}
            </span>
            {peerCount > 0 && animatedBw !== null && <> {fmtBw(animatedBw)}</>}
          </>
        )}
      </span>
    </div>
  );
}
