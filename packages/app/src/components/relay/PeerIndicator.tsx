'use client';

import { useAnimatedNumber } from '~/hooks/useAnimatedNumber';
import { usePeerMesh } from '~/hooks/relay/usePeerMesh';

function fmtBw(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} MBPS`;
  return `${kbps.toFixed(1)} KBPS`;
}

export function PeerIndicator() {
  const { peerCount, bandwidthKbps } = usePeerMesh();
  const animatedBw = useAnimatedNumber(peerCount > 0 ? bandwidthKbps : null);

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs uppercase">
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          peerCount > 0
            ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'
            : 'bg-muted-foreground/40'
        }`}
      />
      <span className="text-muted-foreground tabular-nums">
        {peerCount} {peerCount === 1 ? 'PEER' : 'PEERS'}
        {peerCount > 0 && animatedBw !== null && (
          <span className="text-muted-foreground/60"> {fmtBw(animatedBw)}</span>
        )}
      </span>
    </div>
  );
}
