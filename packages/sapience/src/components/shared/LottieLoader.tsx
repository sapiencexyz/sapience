'use client';

interface LottieLoaderProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

const LottieLoader = ({
  className = '',
  width = 12,
  height = 12,
}: LottieLoaderProps) => {
  const SCALE = 0.5;
  const computedWidth =
    typeof width === 'number' ? Math.max(1, width * SCALE) : width;
  const computedHeight =
    typeof height === 'number' ? Math.max(1, height * SCALE) : height;
  return (
    <span
      className={`inline-block align-middle rounded-full bg-foreground opacity-50 animate-ping ${className}`}
      style={{ width: computedWidth, height: computedHeight }}
    />
  );
};

export default LottieLoader;
