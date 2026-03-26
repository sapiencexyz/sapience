'use client';

import { useState } from 'react';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { useSecondTick } from '~/hooks/useSecondTick';
import type { LoggedMessage } from '~/hooks/relayer/useRelayerMessageLog';

function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatTimeFull(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

interface MessageRowProps {
  message: LoggedMessage;
}

const MessageRow = ({ message }: MessageRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const now = useSecondTick();
  void now;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 pl-3 pr-4 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <TooltipProvider>
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
        </TooltipProvider>
        <span className="font-mono shrink-0">{message.type}</span>
        <span className="font-mono text-muted-foreground truncate min-w-0">
          {JSON.stringify(message.payload)}
        </span>
        <span className="ml-auto shrink-0">
          {message.source === 'p2p' ? (
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono border-purple-500/30 bg-purple-500/10 text-purple-500"
            >
              MESH
            </Badge>
          ) : message.source === 'relayer' ? (
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
            >
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
