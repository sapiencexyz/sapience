'use client';

import { useEffect, useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import {
  PositionStage,
  type PositionProgressState,
} from '~/types/positionProgress';
import { getExplorerUrl } from '~/lib/utils/util';

interface PositionProgressBarProps {
  progressState: PositionProgressState;
  userAddress?: string;
}

// Base labels without dots - dots are animated separately
const STAGE_LABELS: Record<PositionStage, string> = {
  [PositionStage.IDLE]: 'Ready',
  [PositionStage.SUBMITTING]: 'SUBMITTING TO ETHEREAL',
  [PositionStage.CONFIRMING]: 'CONFIRMING ONCHAIN',
  [PositionStage.INDEXING]: 'INDEXING POSITION',
  [PositionStage.COMPLETE]: 'COMPLETE',
  [PositionStage.ERROR]: 'ERROR',
};

// Show "taking longer" message after this many seconds
const TAKING_LONGER_THRESHOLD_SECONDS = 6;

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

// Catch-up animation duration when entering INDEXING stage
const CATCHUP_DURATION_MS = 500;
const CATCHUP_TARGET = 50;

export default function PositionProgressBar({
  progressState,
  userAddress,
}: PositionProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayLabel, setDisplayLabel] = useState('');
  const [labelOpacity, setLabelOpacity] = useState(1);
  const [dotCount, setDotCount] = useState(1); // For animated dots: 1, 2, or 3
  const { stage, benchmarks } = progressState;
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Catch-up animation state
  const [catchUpTarget, setCatchUpTarget] = useState<number | null>(null);
  const catchUpStartRef = useRef<{ time: number; progress: number } | null>(
    null
  );
  const prevStageRef = useRef<PositionStage>(PositionStage.IDLE);

  // Animated dots effect (cycles every 500ms: . -> .. -> ... -> .)
  useEffect(() => {
    if (isTerminalStage(stage)) {
      setDotCount(1);
      return;
    }

    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [stage]);

  // Track if we're taking longer than expected
  const [showTakingLonger, setShowTakingLonger] = useState(false);

  // Show "taking longer" message after threshold
  useEffect(() => {
    if (isTerminalStage(stage)) {
      setShowTakingLonger(false);
      return;
    }

    const timeout = setTimeout(() => {
      setShowTakingLonger(true);
    }, TAKING_LONGER_THRESHOLD_SECONDS * 1000);

    return () => clearTimeout(timeout);
  }, [stage]);

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
      setCatchUpTarget(null);
      catchUpStartRef.current = null;
      prevStageRef.current = PositionStage.IDLE; // Reset prevStage for next submission
      setShowTakingLonger(false);
    }
  }, [stage]);

  // Detect stage change to INDEXING and trigger catch-up if progress < 50%
  // Use a ref to track current progress to avoid dependency on displayProgress state
  const currentProgressRef = useRef(0);
  currentProgressRef.current = displayProgress;

  useEffect(() => {
    if (
      stage === PositionStage.INDEXING &&
      prevStageRef.current !== PositionStage.INDEXING &&
      currentProgressRef.current < CATCHUP_TARGET
    ) {
      catchUpStartRef.current = {
        time: Date.now(),
        progress: currentProgressRef.current,
      };
      setCatchUpTarget(CATCHUP_TARGET);
    }
    prevStageRef.current = stage;
  }, [stage]);

  // Simple smooth animation from 0 to 99% over ANIMATION_DURATION_SECONDS
  // With catch-up mode when entering INDEXING stage
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
      // Check if we're in catch-up mode
      if (catchUpTarget !== null && catchUpStartRef.current) {
        const catchUpElapsed = Date.now() - catchUpStartRef.current.time;
        const t = Math.min(catchUpElapsed / CATCHUP_DURATION_MS, 1);
        const easedT = 1 - Math.pow(1 - t, 2); // ease-out
        const catchUpProgress =
          catchUpStartRef.current.progress +
          (catchUpTarget - catchUpStartRef.current.progress) * easedT;

        setDisplayProgress(catchUpProgress);

        if (t >= 1) {
          // Catch-up complete - adjust startTime so normal animation continues from 50%
          // Calculate what time would give us 50% progress in the ease-out curve
          // For ease-out: progress = (1 - (1-t)^2) * 99, so at 50%: t ≈ 0.29
          // Adjust startTime so elapsed time corresponds to 50% progress
          const progressRatio = CATCHUP_TARGET / targetProgress; // 50/99
          const tForTarget = 1 - Math.sqrt(1 - progressRatio);
          const elapsedForTarget =
            tForTarget * ANIMATION_DURATION_SECONDS * 1000;
          startTimeRef.current = Date.now() - elapsedForTarget;

          setCatchUpTarget(null);
          catchUpStartRef.current = null;
        }

        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Normal animation - use startTimeRef for continuity after catch-up
      const effectiveStartTime = startTimeRef.current || startTime;
      const elapsed = Date.now() - effectiveStartTime;
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
  }, [stage, catchUpTarget]);

  // Don't render for IDLE or COMPLETE
  if (stage === PositionStage.IDLE || stage === PositionStage.COMPLETE) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-2 h-[44px]">
      {/* Status text row with main label and "taking longer" message */}
      <div className="flex justify-between items-center">
        {/* Main status text with fade transition and animated dots */}
        <span
          className="font-mono text-[hsl(var(--accent-gold))] text-sm uppercase tracking-wider transition-opacity"
          style={{
            opacity: labelOpacity,
            transitionDuration: `${FADE_DURATION_MS}ms`,
          }}
        >
          {displayLabel}
          {displayLabel && '.'.repeat(dotCount)}
        </span>

        {/* "Re-querying indexer" message with hover card - only in INDEXING stage after threshold */}
        {stage === PositionStage.INDEXING && showTakingLonger && (
          <HoverCard openDelay={100} closeDelay={200}>
            <HoverCardTrigger asChild>
              <span className="font-mono text-muted-foreground text-sm uppercase tracking-wider inline-flex items-center gap-1 cursor-help animate-in fade-in duration-300">
                QUERYING INDEXER
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-80 text-sm">
              <p>
                The app is waiting for the indexer to find this position
                onchain.
                {userAddress && (
                  <>
                    {' '}
                    Use the{' '}
                    <a
                      href={`${getExplorerUrl()}/address/${userAddress}?tab=token_transfers`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[hsl(var(--accent-gold))] hover:underline"
                    >
                      block explorer
                    </a>{' '}
                    to verify whether the trade succeeded or ask
                  </>
                )}
                {!userAddress && ' Ask'} for support in{' '}
                <a
                  href="https://discord.gg/sapience"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(var(--accent-gold))] hover:underline"
                >
                  Discord
                </a>
                .
              </p>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

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
