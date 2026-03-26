'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { TableRow, TableCell } from '@sapience/ui/components/ui/table';
import MessageRow from './MessageRow';
import {
  formatTimeAgo,
  formatTimeFull,
  badgeBase,
  sourceBadge,
  p2pBadge,
} from './utils';
import type { MessageGroup } from '~/hooks/relayer/useRelayerMessageLog';
import { useSecondTick } from '~/hooks/useSecondTick';

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

const categoryColors: Record<string, string> = {
  rfq: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  vault: 'border-green-500/30 bg-green-500/10 text-green-500',
  secondary: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
};

interface MessageGroupRowProps {
  group: MessageGroup;
}

const MessageGroupRow = ({ group }: MessageGroupRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const sourceSummary = getSourceSummary(group);
  useSecondTick();

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell className="font-mono text-xs text-muted-foreground py-1.5 px-4">
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
