'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { TableRow, TableCell } from '@sapience/ui/components/ui/table';
import MessageRow from './MessageRow';
import type { MessageGroup } from '~/hooks/relayer/useRelayerMessageLog';
import { useSecondTick } from '~/hooks/useSecondTick';

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

function truncateId(id: string, maxLen = 16): string {
  return id.length > maxLen ? id.slice(0, maxLen) + '…' : id;
}

function getTypesSummary(group: MessageGroup): string {
  return group.messages.map((m) => m.type).join(', ');
}

function getSourceSummary(group: MessageGroup) {
  const sources = new Set(group.messages.map((m) => m.source).filter(Boolean));
  if (sources.has('relayer') && sources.has('p2p')) return 'both';
  if (sources.has('p2p')) return 'p2p';
  return 'relayer';
}

const badgeBase = 'px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono';

const categoryColors: Record<string, string> = {
  rfq: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  vault: 'border-green-500/30 bg-green-500/10 text-green-500',
  secondary: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
};

const sourceBadge = `${badgeBase} border-muted-foreground/30 bg-muted/20 text-muted-foreground`;
const p2pBadge = `${badgeBase} border-purple-500/30 bg-purple-500/10 text-purple-500`;

interface MessageGroupRowProps {
  group: MessageGroup;
}

const MessageGroupRow = ({ group }: MessageGroupRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const sourceSummary = getSourceSummary(group);
  const now = useSecondTick();
  void now; // trigger re-render every second

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell className="font-mono text-xs text-muted-foreground py-1.5 px-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default">
                  {formatTimeAgo(group.updatedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">
                  {formatTimeFull(group.updatedAt)}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell className="py-1.5 px-4">
          <Badge
            variant="outline"
            className={`${badgeBase} ${categoryColors[group.category] ?? ''}`}
          >
            {group.category.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs py-1.5 px-4 truncate">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default">
                  {truncateId(group.groupId)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">{group.groupId}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell
          className="font-mono text-xs text-muted-foreground truncate max-w-0 py-1.5 px-4"
          title={getTypesSummary(group)}
        >
          <span className="text-white">{group.messages.length} MESSAGES</span>{' '}
          {getTypesSummary(group)}
        </TableCell>
        <TableCell className="text-right py-1.5 px-4">
          {sourceSummary === 'both' ? (
            <span className="flex gap-1 justify-end">
              <Badge variant="outline" className={sourceBadge}>
                RELAYER
              </Badge>
              <Badge variant="outline" className={p2pBadge}>
                MESH
              </Badge>
            </span>
          ) : sourceSummary === 'p2p' ? (
            <Badge variant="outline" className={p2pBadge}>
              MESH
            </Badge>
          ) : (
            <Badge variant="outline" className={sourceBadge}>
              RELAYER
            </Badge>
          )}
        </TableCell>
      </TableRow>
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <tr>
            <td colSpan={5} className="p-0">
              <motion.div
                key="expanded"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <div className="bg-muted/20 border-b border-border">
                  {group.messages.map((msg) => (
                    <MessageRow key={msg.id} message={msg} />
                  ))}
                </div>
              </motion.div>
            </td>
          </tr>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default MessageGroupRow;
