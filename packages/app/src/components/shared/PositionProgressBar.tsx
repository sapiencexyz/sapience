'use client';

import { useEffect, useState, useRef } from 'react';
import {
  PositionStage,
  type PositionProgressState,
} from '~/types/positionProgress';

interface PositionProgressBarProps {
  progressState: PositionProgressState;
}

const STAGE_LABELS: Record<PositionStage, string> = {
  [PositionStage.IDLE]: 'Ready',
  [PositionStage.SUBMITTING]: 'SUBMITTING TO ETHEREAL...',
  [PositionStage.CONFIRMING]: 'CONFIRMING ONCHAIN...',
  [PositionStage.INDEXING]: 'CHECKING INDEXER...',
  [PositionStage.COMPLETE]: 'COMPLETE',
  [PositionStage.ERROR]: 'ERROR',
};

// Duration for progress bar to reach ~99% (in seconds)
const ANIMATION_DURATION_SECONDS = 18;
const FADE_DURATION_MS = 200;

// Terminal stages where progress bar should not animate
const TERMINAL_STAGES = new Set([
  PositionStage.IDLE,
  PositionStage.COMPLETE,
  PositionStage.ERROR,
]);

function isTerminalStage(stage: PositionStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

export default function PositionProgressBar({
  progressState,
}: PositionProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayLabel, setDisplayLabel] = useState('');
  const [labelOpacity, setLabelOpacity] = useState(1);
  const { stage, benchmarks } = progressState;
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Handle label fade transition when stage changes
  useEffect(() => {
    if (stage === PositionStage.IDLE || stage === PositionStage.COMPLETE) {
      setDisplayLabel('');
      setLabelOpacity(1);
      return;
    }

    const newLabel = STAGE_LABELS[stage];

    if (displayLabel === '') {
      // First label, just show it
      setDisplayLabel(newLabel);
      setLabelOpacity(1);
    } else if (displayLabel !== newLabel) {
      // Fade out, change text, fade in
      setLabelOpacity(0);
      const timeout = setTimeout(() => {
        setDisplayLabel(newLabel);
        setLabelOpacity(1);
      }, FADE_DURATION_MS);
      return () => clearTimeout(timeout);
    }
  }, [stage, displayLabel]);

  // Capture start time once when animation begins
  useEffect(() => {
    if (!isTerminalStage(stage) && !startTimeRef.current) {
      startTimeRef.current = benchmarks.submissionStartedAt || Date.now();
    }
  }, [stage, benchmarks.submissionStartedAt]);

  // Reset when stage becomes IDLE
  useEffect(() => {
    if (stage === PositionStage.IDLE) {
      setDisplayProgress(0);
      startTimeRef.current = null;
    }
  }, [stage]);

  // Simple smooth animation from 0 to 99% over ANIMATION_DURATION_SECONDS
  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (isTerminalStage(stage)) {
      return;
    }

    const startTime = startTimeRef.current || Date.now();
    const targetProgress = 99;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const elapsedSeconds = elapsed / 1000;

      // Ease-out curve: fast start, slows down as it approaches 99%
      // Using 1 - (1 - t)^2 for smooth deceleration
      const t = Math.min(elapsedSeconds / ANIMATION_DURATION_SECONDS, 1);
      const easedT = 1 - Math.pow(1 - t, 2);
      const progress = easedT * targetProgress;

      setDisplayProgress(progress);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stage]);

  // Don't render for IDLE or COMPLETE
  if (stage === PositionStage.IDLE || stage === PositionStage.COMPLETE) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-2 h-[44px]">
      {/* Status text with fade transition */}
      <span
        className="font-mono text-[hsl(var(--accent-gold))] text-sm uppercase tracking-wider transition-opacity"
        style={{
          opacity: labelOpacity,
          transitionDuration: `${FADE_DURATION_MS}ms`,
        }}
      >
        {displayLabel}
      </span>

      {/* Full-width progress bar */}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-[hsl(var(--accent-gold))]"
          style={{ width: `${displayProgress}%` }}
        />
      </div>
    </div>
  );
}
