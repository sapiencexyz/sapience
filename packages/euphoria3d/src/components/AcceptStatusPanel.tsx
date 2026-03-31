import { useEffect, useRef } from 'react';
import type { AcceptLogEntry } from '../hooks/useAcceptBid';

interface AcceptStatusPanelProps {
  log: AcceptLogEntry[];
  onClear: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

export function AcceptStatusPanel({ log, onClear }: AcceptStatusPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log.length]);

  if (log.length === 0) return null;

  return (
    <div className="accept-status-panel">
      <div className="accept-status-header">
        <span>TX STATUS</span>
        <button className="accept-status-clear" onClick={onClear}>x</button>
      </div>
      <div className="accept-status-log" ref={scrollRef}>
        {log.map((entry, i) => (
          <div key={i} className={`accept-status-line accept-status-${entry.step}`}>
            <span className="accept-status-time">{formatTime(entry.timestamp)}</span>
            <span className="accept-status-cube">[{entry.id}]</span>
            <span className="accept-status-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
