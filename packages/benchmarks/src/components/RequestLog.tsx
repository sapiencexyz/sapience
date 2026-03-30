import { useEffect, useRef, useState } from 'react';
import { GET_QUESTIONS } from '../lib/gqlRunner';

export interface LogEntry {
  timestamp: number;
  durationMs: number;
  success: boolean;
  message?: string;
  variables?: Record<string, unknown>;
}

function QueryDialog({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="query-dialog" onClose={onClose} onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}>
      <div className="query-dialog-content">
        <div className="query-dialog-header">
          <span className={`log-badge ${entry.success ? 'badge-success' : 'badge-error'}`}>
            {entry.success ? 'OK' : 'ERR'}
          </span>
          <span>{entry.durationMs.toFixed(0)}ms</span>
          {entry.message && <span className="query-dialog-msg">{entry.message}</span>}
          <button className="query-dialog-close" onClick={onClose}>x</button>
        </div>
        <div className="query-dialog-section">
          <h5>Variables</h5>
          <pre>{JSON.stringify(entry.variables ?? {}, null, 2)}</pre>
        </div>
        <div className="query-dialog-section">
          <h5>Query</h5>
          <pre>{GET_QUESTIONS.trim()}</pre>
        </div>
      </div>
    </dialog>
  );
}

export function RequestLog({ entries }: { entries: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inspecting, setInspecting] = useState<LogEntry | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  return (
    <>
      <div className="request-log" ref={containerRef}>
        {entries.slice(-100).map((entry, i) => (
          <div
            key={i}
            className={`log-entry ${entry.success ? 'success' : 'error'} ${entry.variables ? 'log-clickable' : ''}`}
            onClick={() => entry.variables && setInspecting(entry)}
          >
            <span className="log-time">
              {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 })}
            </span>
            <span className={`log-badge ${entry.success ? 'badge-success' : 'badge-error'}`}>
              {entry.success ? 'OK' : 'ERR'}
            </span>
            <span className="log-duration">{entry.durationMs.toFixed(0)}ms</span>
            {entry.message && <span className="log-message">{entry.message}</span>}
            {entry.variables && <button className="log-query-btn" onClick={(e) => { e.stopPropagation(); setInspecting(entry); }}>SHOW QUERY</button>}
          </div>
        ))}
      </div>
      {inspecting && <QueryDialog entry={inspecting} onClose={() => setInspecting(null)} />}
    </>
  );
}
