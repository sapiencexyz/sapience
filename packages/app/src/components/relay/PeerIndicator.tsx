'use client';

import { usePeerMesh } from '~/hooks/relay/usePeerMesh';

export function PeerIndicator() {
  const { peerCount } = usePeerMesh();

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
        {peerCount.toLocaleString()} {peerCount === 1 ? 'peer' : 'peers'}
      </span>
    </div>
  );
}
