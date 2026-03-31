import { useState, useEffect, useMemo } from 'react';
import type { SessionCreationStep } from '../lib/sessionKeyManager';

interface SessionOverlayProps {
  isCreating: boolean;
  step: SessionCreationStep | null;
  error: Error | null;
  onRetry: () => void;
  onSkip: () => void;
}

export function SessionOverlay({ isCreating, step, error, onRetry, onSkip }: SessionOverlayProps) {
  // Status message mapping
  const statusMessage = useMemo(() => {
    if (error) return 'CONNECTION FAILED';
    if (!isCreating) return null;
    switch (step) {
      case 'switching-network':
        return 'SWITCHING NETWORK';
      case 'requesting-approval':
        return 'ESTABLISHING CONNECTION';
      case 'deploying-account':
      case 'finalizing':
        return 'FINALIZING CONNECTION';
      default:
        return 'ESTABLISHING CONNECTION';
    }
  }, [isCreating, step, error]);

  // Animated dots
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    if (!isCreating || error) {
      setDotCount(1);
      return;
    }
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [isCreating, error]);

  // Fade transition between messages
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!statusMessage) {
      setDisplayed(null);
      return;
    }
    if (displayed === null) {
      setDisplayed(statusMessage);
      return;
    }
    if (statusMessage !== displayed) {
      setIsFading(true);
      const timeout = setTimeout(() => {
        setDisplayed(statusMessage);
        setIsFading(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [statusMessage, displayed]);

  if (!isCreating && !error) return null;

  return (
    <div className="session-overlay">
      {error ? (
        <div className="session-overlay-error">
          <span className="session-overlay-text session-overlay-error-text">
            {displayed}
          </span>
          <span className="session-overlay-error-detail">
            {error.message.length > 100 ? error.message.slice(0, 100) + '...' : error.message}
          </span>
          <div className="session-overlay-actions">
            <button className="wallet-btn" onClick={onRetry}>
              Retry
            </button>
            <button className="wallet-btn" onClick={onSkip}>
              Skip
            </button>
          </div>
        </div>
      ) : (
        <span
          className="session-overlay-text"
          style={{ opacity: isFading ? 0 : 1 }}
        >
          {displayed ?? 'GETTING READY'}
          <span className="session-overlay-dots">{'.'.repeat(dotCount)}</span>
        </span>
      )}
    </div>
  );
}
