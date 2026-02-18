'use client';

type PulsingGradientProps = {
  gradient: string;
  className?: string;
  /** Base opacity to apply outside of the animation keyframes */
  baseOpacity?: number;
  /** Override animation duration in ms to sync with external animations */
  durationMs?: number;
};

export default function PulsingGradient({
  gradient,
  className,
  baseOpacity = 0.04,
  durationMs,
}: PulsingGradientProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute animate-overlay-pulse ${className ?? ''}`}
      style={{
        background: gradient,
        backgroundRepeat: 'no-repeat',
        opacity: baseOpacity,
        ...(durationMs ? { animationDuration: `${durationMs}ms` } : {}),
      }}
    />
  );
}
