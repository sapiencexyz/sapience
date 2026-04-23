'use client';

import { useState } from 'react';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { formatTimeAgo, formatTimeFull, sourceBadge, p2pBadge } from './utils';
import { useSecondTick } from '~/hooks/useSecondTick';
import type { LoggedMessage } from '~/hooks/ws/useRelayerMessageLog';

interface MessageRowProps {
  message: LoggedMessage;
}

const MessageRow = ({ message }: MessageRowProps) => {
  const [expanded, setExpanded] = useState(false);
  useSecondTick();

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 pl-3 pr-4 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-muted-foreground shrink-0 cursor-default">
              {formatTimeAgo(message.timestamp)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-mono text-xs">
              {formatTimeFull(message.timestamp)}
            </span>
          </TooltipContent>
        </Tooltip>
        <span className="font-mono shrink-0">{message.type}</span>
        <span className="font-mono text-muted-foreground truncate min-w-0">
          {JSON.stringify(message.payload)}
        </span>
        <span className="ml-auto shrink-0">
          {message.source === 'p2p' ? (
            <Badge variant="outline" className={p2pBadge}>
              MESH
            </Badge>
          ) : message.source === 'relayer' ? (
            <Badge variant="outline" className={sourceBadge}>
              RELAYER
            </Badge>
          ) : null}
        </span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] bg-muted/30 overflow-x-auto max-h-60">
          {JSON.stringify(message.payload, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default MessageRow;
