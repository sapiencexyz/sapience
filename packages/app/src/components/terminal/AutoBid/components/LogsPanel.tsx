import type React from 'react';
import type { AutoBidLogEntry } from '../types';
import { LOG_SEVERITY_CLASSES } from '../constants';
import { formatLogDisplayTime } from '../utils';
import { cn } from '~/lib/utils/util';

type LogsPanelProps = {
  logs: AutoBidLogEntry[];
  orderLabelById: Record<string, string>;
};

const LogsPanel: React.FC<LogsPanelProps> = ({ logs, orderLabelById }) => {
  if (logs.length === 0) {
    return null;
  }

  return (
    <div className="px-1 flex flex-col justify-end animate-in fade-in duration-200">
      <div className="text-xs font-medium text-muted-foreground mb-1">Logs</div>
      <section className="rounded-md border border-border/60 bg-muted/5 p-1 flex flex-col min-h-[110px]">
        <div className="flex-1 min-h-0">
          <div className="h-[110px] overflow-y-auto overflow-x-auto pr-1">
            <ul className="space-y-1">
              {logs.map((entry, index) => {
                const severityClass =
                  LOG_SEVERITY_CLASSES[entry.severity ?? 'info'] ||
                  LOG_SEVERITY_CLASSES.info;

                // Use structured meta fields for display
                const verb =
                  typeof entry.meta?.verb === 'string' ? entry.meta.verb : '';
                const formattedPrefix =
                  typeof entry.meta?.formattedPrefix === 'string'
                    ? entry.meta.formattedPrefix
                    : '';
                const highlight =
                  typeof entry.meta?.highlight === 'string'
                    ? entry.meta.highlight
                    : '';

                // Derive order label from current state or stored snapshot
                const derivedLabel =
                  typeof entry.meta?.orderId === 'string'
                    ? (orderLabelById[entry.meta.orderId] ?? null)
                    : null;
                const storedSnapshot =
                  typeof entry.meta?.labelSnapshot === 'string'
                    ? entry.meta.labelSnapshot
                    : null;
                const orderLabel = derivedLabel ?? storedSnapshot ?? null;

                // Build display: prefer structured meta, fallback to raw message
                const prefix =
                  formattedPrefix && verb
                    ? `${orderLabel ?? formattedPrefix} ${verb}`
                    : '';
                // Don't show suffix if it's the same as the verb (avoids "paused paused")
                const suffix =
                  highlight && highlight !== verb
                    ? highlight
                    : !prefix
                      ? entry.message
                      : '';

                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex items-center gap-2 text-[11px] font-mono whitespace-nowrap pr-1 rounded-sm px-2 py-1',
                      index % 2 === 1 ? 'bg-muted/30' : ''
                    )}
                  >
                    <span className="text-muted-foreground/70 shrink-0">
                      {formatLogDisplayTime(entry.createdAt)}
                    </span>
                    <span className="shrink-0">
                      {prefix && (
                        <span className="text-brand-white">{prefix} </span>
                      )}
                      <span className={severityClass}>{suffix}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LogsPanel;
