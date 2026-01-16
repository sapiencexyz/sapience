'use client';

interface LoaderProps {
  className?: string;
  size?: number;
  /** Duration in ms for one full rotation (default: 429ms = 140 BPM) */
  durationMs?: number;
}

const Loader = ({
  className = '',
  size = 12,
  durationMs = 429,
}: LoaderProps) => {
  const strokeWidth = Math.max(0.75, size / 16);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const innerRadius = radius - strokeWidth / 2;
  const outerRadius = radius + strokeWidth / 2;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Base circle - subtle gold ring */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--accent-gold))"
          strokeOpacity={0.2}
          strokeWidth={strokeWidth}
        />
      </svg>

      {/* Rotating pulse - conic gradient masked to ring */}
      <div
        className="absolute inset-0 animate-spin"
        style={{
          animationDuration: `${durationMs}ms`,
          animationTimingFunction: 'linear',
          background: `conic-gradient(
            from 0deg,
            transparent 0deg,
            hsl(var(--accent-gold) / 0) 0deg,
            hsl(var(--accent-gold) / 0.4) 54deg,
            hsl(var(--accent-gold) / 0) 108deg,
            transparent 108deg
          )`,
          mask: `radial-gradient(
            circle at center,
            transparent ${innerRadius}px,
            black ${innerRadius}px,
            black ${outerRadius}px,
            transparent ${outerRadius}px
          )`,
          WebkitMask: `radial-gradient(
            circle at center,
            transparent ${innerRadius}px,
            black ${innerRadius}px,
            black ${outerRadius}px,
            transparent ${outerRadius}px
          )`,
        }}
      />
    </div>
  );
};

export default Loader;
