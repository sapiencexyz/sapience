'use client';

import { usePeerMesh } from '~/hooks/relay/usePeerMesh';

function fmtBw(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps.toFixed(1)} Kbps`;
}

export function PeerIndicator() {
  const { peerCount, bandwidthKbps } = usePeerMesh();

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          peerCount > 0
            ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'
            : 'bg-muted-foreground/40'
        }`}
      />
      <span className="text-muted-foreground tabular-nums">
        {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
        {peerCount > 0 && (
          <span className="text-muted-foreground/60">
            {' · '}
            {fmtBw(bandwidthKbps)}
          </span>
        )}
      </span>
    </div>
  );
}
